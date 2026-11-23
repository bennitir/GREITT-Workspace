"use client";

import { useEffect, useState } from 'react';
import type { BankAccountOwnerReviewResult } from './internal-transfer-actions';

/** Read-only status: the bookkeeper registers company bank accounts once. */
export default function BankAccountOwnerPanel({ language, sourceAccountId, targetAccountId,
  sourceName, targetName, reviewAction, onPairableChange }: {
  language: string;
  sourceAccountId: number;
  targetAccountId: number;
  sourceName: string;
  targetName: string;
  reviewAction: (sourceId: number, targetId: number) => Promise<BankAccountOwnerReviewResult>;
  onPairableChange: (match: boolean) => void;
}) {
  const [review, setReview] = useState<BankAccountOwnerReviewResult | null>(null);
  const isIcelandic = language === 'is';
  useEffect(() => {
    let current = true;
    onPairableChange(false);
    void reviewAction(sourceAccountId, targetAccountId)
      .then(value => {
        if (!current) return;
        setReview(value);
        onPairableChange(value.ok && value.sameOwner);
      })
      .catch(() => {
        if (!current) return;
        setReview({ ok: false, code: 'UNAVAILABLE' });
        onPairableChange(false);
      });
    return () => { current = false; };
  }, [sourceAccountId, targetAccountId, reviewAction, onPairableChange]);

  const ready = review?.ok && review.sameOwner;
  return <div data-testid="own-transfer-owner-evidence"
    className={`mt-3 rounded border p-3 text-sm ${ready ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
    <p className="font-semibold">{isIcelandic ? 'Skráðir bankareikningar' : 'Registered bank accounts'}</p>
    <p>{sourceName} · {targetName}</p>
    {!review ? <p>{isIcelandic ? 'Athuga skráningu reikninga…' : 'Checking account registration…'}</p>
      : !review.ok ? <p>{isIcelandic ? 'Ekki tókst að staðfesta skráninguna. Pörun er læst.' : 'Cannot check registration. Pairing is locked.'}</p>
      : ready ? <p className="font-medium text-emerald-900">
          {isIcelandic ? 'Sami skráði eigandi. Engin viðbótarstaðfesting reikninga þarf.' :
            'Same registered owner. No additional account verification required.'}
        </p>
      : <p className="font-medium text-amber-900">
          {isIcelandic ? 'Reikningar eru ekki skráðir á sama eiganda eða fyrri eigandaskráningu hefur verið afturkallað. Pörun er læst.' :
            'The accounts do not have the same registered owner, or an ownership record was revoked. Pairing is locked.'}
        </p>}
  </div>;
}
