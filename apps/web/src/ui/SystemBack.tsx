import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { exitApp } from '../native/platform';
import { useSystemBack } from '../native/useSystemBack';
import { ConfirmDialog } from './ConfirmDialog';

/** Home. The one screen Back does not leave. */
const HOME = '/';

/**
 * What the phone's Back button does when nothing else has claimed it.
 *
 * Overlays answer first — see `Modal` — so by the time a press reaches here
 * there is nothing open over the page. Then it is two rules: anywhere but Home
 * goes Home, and Home asks whether to leave.
 *
 * ## Home, replacing rather than pushing
 *
 * The whole point is to stop the history walk, so sending the learner Home must
 * not leave a trail of its own. `replace` keeps the entry count where it is;
 * pushing would build up a stack of Homes for the *header's* back arrow to walk
 * back through, which is the same bug moved one button over.
 *
 * ## Why the dialog is here and not in a page
 *
 * It belongs to the button, not to Home: Home does not otherwise know or care
 * that this app can be left. Keeping the state next to the handler is also what
 * makes a second press while it is open impossible to get wrong — the dialog is
 * a `Modal`, `Modal` registers its own handler when open, and that handler is
 * newer than this one, so it takes the press and closes. There is one piece of
 * state and it cannot open twice.
 */
export function SystemBack() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const location = useLocation();
  const [leaving, setLeaving] = useState(false);

  useSystemBack(
    useCallback(() => {
      if (location.pathname !== HOME) {
        navigate(HOME, { replace: true });
        return true;
      }
      setLeaving(true);
      return true;
    }, [location.pathname, navigate]),
  );

  return (
    <ConfirmDialog
      open={leaving}
      title={t('exit.title')}
      body={t('exit.body')}
      cancelLabel={t('exit.stay')}
      confirmLabel={t('exit.leave')}
      onCancel={() => setLeaving(false)}
      onConfirm={() => void exitApp()}
      cancelTestId="exit-stay"
      confirmTestId="exit-confirm"
    />
  );
}
