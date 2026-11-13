import { classifyScope } from './scopeClassifier';
import { getScopeModelInfo, resetScopeModelForTests } from './scopeModel';

describe('scope classifier performance smoke benchmark', () => {
  it('measures cold and warm classification latency', () => {
    resetScopeModelForTests();
    const coldStart = performance.now();
    classifyScope('show my focus statistics');
    const coldMs = performance.now() - coldStart;

    const samples = [
      'show my focus statistics',
      'how much time did i focus yesterday',
      'start a 25 minute loop',
      'what is the capital of france',
      'show my tasks and tell me a joke',
      'mera focus time kitna tha',
      'ഇന്നലെ എത്ര സമയം focus ചെയ്തു',
    ];
    const iterations = 2000;
    const warmStart = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      classifyScope(
        samples[index % samples.length] ?? 'show my focus statistics'
      );
    }
    const totalWarmMs = performance.now() - warmStart;
    const averageWarmMs = totalWarmMs / iterations;
    const info = getScopeModelInfo();

    console.log(
      'SCOPE_BENCH',
      JSON.stringify({
        coldMs: Number(coldMs.toFixed(3)),
        totalWarmMs: Number(totalWarmMs.toFixed(3)),
        averageWarmMs: Number(averageWarmMs.toFixed(4)),
        iterations,
        modelBytes: info.modelBytes,
        featureBuckets: info.featureBuckets,
        runtime: 'desktop/Jest Node environment; not a device measurement',
      })
    );

    expect(info.modelBytes).toBeLessThanOrEqual(64 * 1024);
    expect(averageWarmMs).toBeLessThan(25);
  });
});
