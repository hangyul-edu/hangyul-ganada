import UIKit
import Capacitor

/// The app's bridge view controller.
///
/// It exists for one reason: Capacitor registers plugins from the
/// `packageClassList` that `npx cap sync` writes into `capacitor.config.json`,
/// and that list is built from installed npm packages. `HangyulStorePlugin`
/// lives in this project rather than in a package, so it would never appear
/// there — and a store plugin that is silently absent means the app falls back
/// to WebView storage without anyone noticing until a learner loses their
/// practice. `capacitorDidLoad()` is the documented hook for exactly this, and
/// registering here means the plugin is present before the WebView loads.
class HangyulViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HangyulStorePlugin())
    }

    /// Portrait on iPhone, any orientation on iPad.
    ///
    /// Handwriting practice is a portrait activity: the canvas is square, the
    /// keyboard is irrelevant, and a phone rotated to landscape leaves a strip
    /// of canvas between two walls of chrome. An iPad is wide enough in either
    /// orientation, and locking a tablet to portrait is the thing that makes an
    /// app feel like a phone app someone stretched.
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
    }
}
