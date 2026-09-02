import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { exitApp } from '../native/platform';
import { useHistoryDepth } from '../native/useHistoryDepth';
import { useSystemBack } from '../native/useSystemBack';
import { ConfirmDialog } from './ConfirmDialog';

/** Home. The one screen Back does not leave. */
const HOME = '/';

/**
 * What the phone's Back button does when nothing else has claimed it.
 *
 * Overlays answer first — see `Modal` — so by the time a press reaches here
 * there is nothing open over the page.
 *
 * ## The rule, and the one it replaced
 *
 * Back returns to **the screen before this one**, and at Home it offers to
 * leave. That is the platform convention on both phones and it is what the
 * header's own back arrow has always done.
 *
 * It used to be "anywhere but Home goes Home", which was deliberate — it was
 * meant to stop a learner walking back through a long history — and which
 * produced the behaviour QA reported: one press from anywhere landed on Home,
 * a second press offered to exit, and changing a letter category and pressing
 * Back jumped to Home rather than back to the category list. A learner three
 * screens into a lesson had no way back to the screen they came from, so the
 * button did not mean anything they could predict; the only reliable way back
 * one step was the header arrow, and the two buttons disagreeing is worse than
 * either rule on its own.
 *
 * ## Knowing whether there is anywhere to go
 *
 * `useHistoryDepth` counts what *this app* has pushed since it opened, which
 * is the question `window.history.length` cannot answer — that counts the tab,
 * including whatever the learner was looking at before they arrived. At depth
 * zero the current screen is the first one this session put on the stack — a
 * cold start, a deep link, or a refreshed page — and there is nothing of ours
 * behind it. Then, and only then, Back falls back to Home, and from Home it
 * offers to leave.
 *
 * So the three cases are:
 *
 * ```
 * depth > 0            → navigate(-1)     the screen they came from
 * depth 0, not Home    → Home, replacing  a deep link or a refresh
 * Home                 → offer to leave
 * ```
 *
 * The Home fallback still *replaces* rather than pushes: it is there to end a
 * walk, and pushing would leave a stack of Homes for the header arrow to walk
 * back through — the same bug moved one button over.
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
  const depth = useHistoryDepth();

  useSystemBack(
    useCallback(() => {
      if (depth.current > 0) {
        navigate(-1);
        return true;
      }
      if (location.pathname !== HOME) {
        navigate(HOME, { replace: true });
        return true;
      }
      setLeaving(true);
      return true;
    }, [depth, location.pathname, navigate]),
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
