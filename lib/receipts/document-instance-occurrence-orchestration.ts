/**
 * Provider-neutral occurrence discovery before the authoritative identity executor.
 *
 * Discovery is advisory: it cannot confirm an identity or override duplicate
 * blocking. The booking executor must still re-read company/binding/source
 * under its company lock and verify evidence before confirmation.
 */
import type {
  IdentityCandidate,
  IdentityEvidence,
  parseDocumentIdentityEnvelope,
} from "./document-instance-envelope";

export type DocumentInstanceIdentityExecution =
  | {
      kind: "EXISTING_PROPOSAL";
      revision: number;
      evidenceDigest: string;
    }
  | {
      kind: "NEW_PROPOSAL";
      candidate: IdentityCandidate;
      evidence: IdentityEvidence;
    };

export type DocumentOccurrenceDiscoveryResult =
  | {
      status: "DISCOVERED";
      candidate: IdentityCandidate;
      evidence: IdentityEvidence;
    }
  | { status: "UNAVAILABLE"; reason: string };

export type DocumentOccurrenceProvider<Context> = {
  id: string;
  isApplicable: (context: Context) => boolean;
  discover: (context: Context) => Promise<DocumentOccurrenceDiscoveryResult>;
};

export type DocumentInstancePreparationPlan =
  | { status: "CONFIRMED" }
  | { status: "NOT_APPLICABLE" }
  | { status: "UNAVAILABLE"; reason: string }
  | {
      status: "EXECUTE";
      execution: DocumentInstanceIdentityExecution;
    };

/**
 * Existing state takes priority over provider discovery. In particular, an
 * existing proposal must be verified by the executor, not replaced with a new
 * proposal from a different provider. Ambiguous provider ownership fails closed.
 */
export async function planDocumentInstanceOccurrencePreparation<Context>(input: {
  existing: ReturnType<typeof parseDocumentIdentityEnvelope>;
  context: Context;
  providers: readonly DocumentOccurrenceProvider<Context>[];
}): Promise<DocumentInstancePreparationPlan> {
  const { existing } = input;
  if (existing.ok) {
    if (existing.envelope.state === "CONFIRMED") {
      return { status: "CONFIRMED" };
    }
    if (existing.envelope.state === "PROPOSED") {
      return {
        status: "EXECUTE",
        execution: {
          kind: "EXISTING_PROPOSAL",
          revision: existing.envelope.revision,
          evidenceDigest: existing.envelope.evidenceDigest,
        },
      };
    }
    return { status: "UNAVAILABLE", reason: "IDENTITY_NOT_PROPOSABLE" };
  }
  if (existing.code !== "ABSENT") {
    return { status: "UNAVAILABLE", reason: existing.code };
  }

  const applicable = input.providers.filter((provider) =>
    provider.isApplicable(input.context),
  );
  if (applicable.length === 0) return { status: "NOT_APPLICABLE" };
  if (applicable.length > 1) {
    return { status: "UNAVAILABLE", reason: "AMBIGUOUS_OCCURRENCE_PROVIDER" };
  }

  const discovery = await applicable[0].discover(input.context);
  if (discovery.status === "UNAVAILABLE") return discovery;
  return {
    status: "EXECUTE",
    execution: {
      kind: "NEW_PROPOSAL",
      candidate: discovery.candidate,
      evidence: discovery.evidence,
    },
  };
}
