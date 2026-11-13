import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import { ASSISTANT_MAX_MESSAGE_LENGTH, ASSISTANT_MESSAGE_LIMIT } from '../constants/assistant';
import { createId } from '../domain/shared/id';
import { nowUtcIso } from '../domain/shared/dateUtils';
import { t } from '../i18n';
import { AssistantActionError, executeAssistantAction, isActionExpired } from '../features/assistant/assistantActionApproval';
import { runAssistantTurn } from '../features/assistant/assistantConversation';
import { describeAssistantError } from '../features/assistant/assistantErrors';
import { createAssistantTools } from '../features/assistant/assistantTools';
import { classifyScope } from '../features/assistant/scope/scopeClassifier';
import { scopeResponseKey } from '../features/assistant/scope/scopeMessages';
import type { ScopeCategory } from '../features/assistant/scope/scopeTypes';
import type {
  AssistantChatMessage,
  AssistantConfig,
  AssistantPendingAction,
} from '../features/assistant/assistantTypes';
import {
  getAssistantApiKey,
} from '../features/assistant/storage/credentialStorage';

const MAX_STREAM_CHARS = 24_000;

type AssistantStatus = 'idle' | 'busy';

type AssistantStore = {
  messages: AssistantChatMessage[];
  pendingAction: AssistantPendingAction | null;
  status: AssistantStatus;
  error: string | null;
  lastFailedText: string | null;
  lastScopeCategory: ScopeCategory | null;
  send: (db: SQLiteDatabase, config: AssistantConfig, text: string) => Promise<void>;
  stop: () => void;
  approve: (
    db: SQLiteDatabase,
    config: AssistantConfig,
    actionId: string
  ) => Promise<void>;
  cancelAction: (actionId: string) => void;
  expireAction: (actionId: string) => void;
  dismissAction: () => void;
  retryLast: (db: SQLiteDatabase, config: AssistantConfig) => Promise<void>;
  clear: () => void;
};

let activeController: AbortController | null = null;

function trimMessages(messages: AssistantChatMessage[]): AssistantChatMessage[] {
  if (messages.length <= ASSISTANT_MESSAGE_LIMIT) return messages;
  return messages.slice(messages.length - ASSISTANT_MESSAGE_LIMIT);
}

function incomingActionBlocks(status: AssistantPendingAction['status']): boolean {
  return status === 'pending' || status === 'executing';
}

export const useAssistantStore = create<AssistantStore>((set, get) => {
  const updateAssistantMessage = (
    id: string,
    updater: (message: AssistantChatMessage) => AssistantChatMessage
  ) => {
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id ? updater(message) : message
      ),
    }));
  };

  const finishWithError = (
    assistantId: string,
    text: string,
    safeError: string
  ) => {
    updateAssistantMessage(assistantId, (message) => ({
      ...message,
      content: message.content.trim()
        ? `${message.content.trim()}\n\n${safeError}`
        : safeError,
      status: 'error',
    }));
    set({ error: safeError, lastFailedText: text });
  };

  return {
    messages: [],
    pendingAction: null,
    status: 'idle',
    error: null,
    lastFailedText: null,
    lastScopeCategory: null,

    send: async (db, config, rawText) => {
      const text = rawText.trim();
      if (!text || get().status === 'busy') return;
      if (!config.enabled) {
        set({ error: t('assistant.errorUnavailable') });
        return;
      }

      if (text.length > ASSISTANT_MAX_MESSAGE_LENGTH) {
        set({
          error: t('assistant.errorTooLong', {
            max: ASSISTANT_MAX_MESSAGE_LENGTH,
          }),
        });
        return;
      }

      let pendingAction = get().pendingAction;
      if (pendingAction) {
        if (isActionExpired(pendingAction)) {
          pendingAction = { ...pendingAction, status: 'expired' };
        }
        if (incomingActionBlocks(pendingAction.status)) {
          set({ error: t('assistant.errorActionPending') });
          return;
        }
        pendingAction = null;
      }

      const scope = (() => {
        try {
          return classifyScope(text, {
            previousCategory: get().lastScopeCategory,
          });
        } catch {
          return {
            category: 'AMBIGUOUS' as const,
            confidence: 0,
            source: 'fallback' as const,
            reason: 'model_error' as const,
          };
        }
      })();
      if (scope.category !== 'IN_SCOPE') {
        const now = nowUtcIso();
        const userMessage: AssistantChatMessage = {
          id: createId(),
          role: 'user',
          content: text,
          createdAt: now,
          status: 'sent',
        };
        const localResponse: AssistantChatMessage = {
          id: createId(),
          role: 'assistant',
          content: t(scopeResponseKey(scope.category)),
          createdAt: now,
          status: 'sent',
        };
        set((state) => ({
          messages: trimMessages([
            ...state.messages,
            userMessage,
            localResponse,
          ]),
          pendingAction,
          status: 'idle',
          error: null,
          lastFailedText: null,
          lastScopeCategory: scope.category,
        }));
        return;
      }
      set({ lastScopeCategory: 'IN_SCOPE' });

      const controller = new AbortController();
      activeController = controller;
      const assistantId = createId();
      const userMessage: AssistantChatMessage = {
        id: createId(),
        role: 'user',
        content: text,
        createdAt: nowUtcIso(),
        status: 'sent',
      };
      const assistantMessage: AssistantChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: nowUtcIso(),
        status: 'streaming',
      };

      set((state) => ({
        messages: trimMessages([
          ...state.messages,
          userMessage,
          assistantMessage,
        ]),
        pendingAction,
        status: 'busy',
        error: null,
        lastFailedText: null,
      }));

      try {
        const apiKey = await getAssistantApiKey(config.provider);
        if (!apiKey) {
          finishWithError(assistantId, text, t('assistant.errorNoKey'));
          return;
        }
        if (controller.signal.aborted) {
          set((state) => ({
            messages: state.messages.filter(
              (message) => message.id !== assistantId
            ),
            status: 'idle',
            error: null,
          }));
          return;
        }

        const result = await runAssistantTurn({
          db,
          config,
          apiKey,
          history: get()
            .messages.slice(0, -2)
            .map((message) => ({ ...message })),
          text,
          signal: controller.signal,
          onTextDelta: (delta) => {
            if (controller.signal.aborted) return;
            updateAssistantMessage(assistantId, (message) => {
              if (message.content.length >= MAX_STREAM_CHARS) return message;
              return {
                ...message,
                content: `${message.content}${delta}`.slice(0, MAX_STREAM_CHARS),
              };
            });
          },
        });

        if (activeController !== controller) return;

        if (controller.signal.aborted) {
          set((state) => {
            const assistant = state.messages.find(
              (message) => message.id === assistantId
            );
            const messages =
              !assistant || !assistant.content.trim()
                ? state.messages.filter((message) => message.id !== assistantId)
                : state.messages.map((message) =>
                    message.id === assistantId
                      ? { ...message, status: 'sent' as const }
                      : message
                  );
            return { messages, status: 'idle', error: null };
          });
          return;
        }

        const content =
          result.content ||
          (result.pendingAction
            ? t('assistant.actionReady')
            : t('assistant.errorEmpty'));
        updateAssistantMessage(assistantId, (message) => ({
          ...message,
          content,
          status: 'sent',
          actionId: result.pendingAction?.id,
        }));
        set({
          pendingAction: result.pendingAction,
          status: 'idle',
          error: null,
          lastFailedText: null,
        });
      } catch (error) {
        if (activeController !== controller) return;
        if (controller.signal.aborted) {
          set((state) => {
            const assistant = state.messages.find(
              (message) => message.id === assistantId
            );
            const messages =
              !assistant || !assistant.content.trim()
                ? state.messages.filter((message) => message.id !== assistantId)
                : state.messages.map((message) =>
                    message.id === assistantId
                      ? { ...message, status: 'sent' as const }
                      : message
                  );
            return { messages, status: 'idle', error: null };
          });
          return;
        }
        finishWithError(assistantId, text, describeAssistantError(error));
      } finally {
        if (activeController === controller) {
          activeController = null;
          if (get().status === 'busy') set({ status: 'idle' });
        }
      }
    },

    stop: () => {
      activeController?.abort();
    },

    approve: async (db, config, actionId) => {
      const action = get().pendingAction;
      if (!action || action.id !== actionId) return;
      if (!config.enabled) {
        set({
          pendingAction: { ...action, status: 'cancelled' },
          error: t('assistant.errorUnavailable'),
        });
        return;
      }

      if (action.status !== 'pending') {
        set({ error: t('assistant.actionAlreadyHandled') });
        return;
      }
      if (isActionExpired(action)) {
        set({ pendingAction: { ...action, status: 'expired' } });
        return;
      }

      const tools = createAssistantTools(db);
      const tool = tools.find((entry) => entry.name === action.toolName);
      if (!tool || tool.risk === 'read') {
        set({
          pendingAction: {
            ...action,
            status: 'failed',
            error: t('assistant.errorGeneric'),
          },
        });
        return;
      }

      set({
        pendingAction: { ...action, status: 'executing' },
        error: null,
      });

      try {
        const result = await executeAssistantAction(
          { db },
          tool,
          action,
          { writesEnabled: config.writesEnabled }
        );
        if (get().pendingAction?.id !== action.id) return;
        set({
          pendingAction: {
            ...action,
            status: 'executed',
            result: result.summary,
          },
        });
      } catch (error) {
        if (get().pendingAction?.id !== action.id) return;
        if (
          error instanceof AssistantActionError &&
          error.code === 'expired'
        ) {
          set({ pendingAction: { ...action, status: 'expired' } });
          return;
        }
        set({
          pendingAction: {
            ...action,
            status: 'failed',
            error: describeAssistantError(error),
          },
        });
      }
    },

    cancelAction: (actionId) => {
      const action = get().pendingAction;
      if (!action || action.id !== actionId || action.status !== 'pending') {
        return;
      }
      set({
        pendingAction: { ...action, status: 'cancelled' },
        error: null,
      });
    },

    expireAction: (actionId) => {
      const action = get().pendingAction;
      if (!action || action.id !== actionId || action.status !== 'pending') {
        return;
      }
      if (!isActionExpired(action)) return;
      set({ pendingAction: { ...action, status: 'expired' } });
    },

    dismissAction: () => {
      const action = get().pendingAction;
      if (action?.status === 'executing') return;
      set({ pendingAction: null, error: null });
    },

    retryLast: async (db, config) => {
      if (get().status === 'busy') return;
      const messages = get().messages;
      const last = messages[messages.length - 1];
      const previous = messages[messages.length - 2];
      if (
        !last ||
        !previous ||
        last.role !== 'assistant' ||
        last.status !== 'error' ||
        previous.role !== 'user'
      ) {
        return;
      }
      const text = previous.content;
      set({
        messages: messages.slice(0, -2),
        error: null,
        lastFailedText: null,
      });
      await get().send(db, config, text);
    },

    clear: () => {
      activeController?.abort();
      activeController = null;
      set({
        messages: [],
        pendingAction: null,
        status: 'idle',
        error: null,
        lastFailedText: null,
        lastScopeCategory: null,
      });
    },
  };
});
