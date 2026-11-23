Pod::Spec.new do |s|
  s.name           = 'HourLoopHash'
  s.version        = '1.0.0'
  s.summary        = 'Native SHA-256 file hashing for Hour Loop.'
  s.description    = 'Streams model files through CryptoKit without loading them into JS memory.'
  s.author         = 'Hour Loop'
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = '**/*.{h,m,swift}'
end
