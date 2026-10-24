import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  // RN 0.88's template is Scene-based — SceneDelegate owns the real window,
  // not this property. It's declared anyway because @react-native-firebase/
  // messaging 26.4.0's RNFBMessagingNSNotificationCenter still probes
  // `UIApplication.shared.delegate.window` via dynamic dispatch on launch
  // (ios/RNFBMessaging/RNFBMessaging+NSNotificationCenter.m:90); without a
  // `window` property here that selector doesn't exist on this class at
  // all, which crashes (doesNotRecognizeSelector) on every launch.
  // `UIApplicationDelegate` already declares `window` as an optional
  // protocol property, so satisfying it here is harmless — it just stays
  // nil, and RNFB's nil-check on it skips cleanly instead of crashing.
  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    true
  }
}
