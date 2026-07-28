// SPIKE (mawimbi#593) — entry to String mode.
//
// `?string`, following `useTuningActivation`'s pattern and for the same
// stated reason: available in dev builds, and on deployed previews via a
// query param so the owner can evaluate without a local checkout. The
// spike is evaluated by looking at a branch deploy on a real phone, which
// only works if there is a URL that reaches the view.
//
// Deliberately *not* a toolbar toggle (spec 009 says entry is an explicit
// view toggle; #593 puts that out of spike scope) — a query param costs
// nothing and leaves the default view provably unchanged, which is what
// makes "no visual snapshot should move" a claim worth checking.

import { useState } from 'react';

const STRING_QUERY_PARAM = 'string';

export function useStringModeAvailable(): boolean {
  // Read once per mount: query params don't change without a full
  // navigation in this app's routing model.
  const [isAvailable] = useState(() =>
    new URLSearchParams(window.location.search).has(STRING_QUERY_PARAM),
  );
  return isAvailable;
}
