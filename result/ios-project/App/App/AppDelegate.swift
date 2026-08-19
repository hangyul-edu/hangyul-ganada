import UIKit
import AVFoundation
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        configureAudioSession()
        return true
    }

    /// Makes pronunciation behave the way a learner expects it to.
    ///
    /// A `WKWebView` plays audio under the `ambient` category by default, which
    /// means two things this app cannot live with: the clip is silenced by the
    /// ring/silent switch, and it stops whatever the learner was listening to.
    /// Someone practising 가 on a bus with the switch flipped gets a mute
    /// button that looks broken, and someone practising with music on loses the
    /// music at the first tap.
    ///
    /// `playback` fixes the first — pronunciation is the point of the app, not
    /// incidental sound, so it plays regardless of the silent switch, the same
    /// as any other audio app. `duckOthers` fixes the second: a one-second clip
    /// dips the music instead of ending it, and the music comes back by itself.
    ///
    /// Nothing here starts the session. It is activated lazily by the system on
    /// the first playback and deactivated when the app is backgrounded, which
    /// is what keeps the app off the Now Playing controls and out of the way of
    /// whatever else the phone is doing.
    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.duckOthers]
            )
        } catch {
            // A session the system refuses to configure is not a reason to fail
            // to launch. Audio then behaves as it did before — quieter than
            // intended, but every other part of the lesson still works.
            CAPLog.print("Audio session unavailable: \(error.localizedDescription)")
        }
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
        config.delegateClass = SceneDelegate.self
        return config
    }
}
