export type BankCandidateInput = {
  id: number;
  date: Date;
  text: string;
  amount: number | string;
};

export type BookingCandidateInput = {
  entryId: number;
  receiptId: number;
  voucherNumber: number | null;
  date: Date | null;
  partyText: string | null;
  description: string | null;
  account: string;
  entryText: string;
  debit: number;
  credit: number;
};

export type CandidateStrength = "STRONG" | "POSSIBLE";

export type CandidateReason =
  | "EXACT_DATE_AMOUNT_PARTY"
  | "EXACT_DATE_AMOUNT"
  | "NEAR_DATE_AMOUNT_PARTY"
  | "EXTENDED_DATE_AMOUNT_PARTY"
  | "NO_DATE_AMOUNT_PARTY";

export type BankBookingCandidate = {
  bankTransactionId: number;
  receiptEntryId: number;
  receiptId: number;
  voucherNumber: number | null;
  account: string;
  entryText: string;
  description: string | null;

  bankAmount: number;
  bookingAmount: number;

  dateDistanceDays: number | null;
  partyMatch: boolean;

  strength: CandidateStrength;
  reason: CandidateReason;

  // True aðeins þegar sterka tengingin er einstök báðum megin.
  mutuallyUnique: boolean;
};

export type BankCandidateState =
  | "UNIQUE_STRONG"
  | "AMBIGUOUS_STRONG"
  | "POSSIBLE"
  | "NONE";

export type BankCandidateResolution = {
  bankTransactionId: number;
  state: BankCandidateState;
  strongCandidates: BankBookingCandidate[];
  possibleCandidates: BankBookingCandidate[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toMinorUnits(value: number | string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

function dateOrdinal(date: Date) {
  return Math.floor(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ) / DAY_MS
  );
}

function daysBetween(a: Date, b: Date) {
  return Math.abs(dateOrdinal(a) - dateOrdinal(b));
}

export function normalizePartyText(
  value: string | null | undefined
) {
  const ignored = new Set(["hf", "ehf", "sf", "slf", "ohf"]);

  return String(value ?? "")
    .toLowerCase()
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !ignored.has(part))
    .join(" ")
    .trim();
}

function partiesMatch(
  bankText: string,
  bookingText: string | null
) {
  const bank = normalizePartyText(bankText);
  const booking = normalizePartyText(bookingText);

  if (bank.length < 3 || booking.length < 3) {
    return false;
  }

  return (
    bank === booking ||
    bank.includes(booking) ||
    booking.includes(bank)
  );
}

export function buildBankBookingCandidateGraph(
  bankTransactions: BankCandidateInput[],
  bookingEntries: BookingCandidateInput[]
): BankCandidateResolution[] {
  const rawCandidates: BankBookingCandidate[] = [];

  for (const bank of bankTransactions) {
    const bankMinor = toMinorUnits(bank.amount);
    if (bankMinor === null) continue;

    for (const booking of bookingEntries) {
      // Fyrir eignareikning banka:
      // debit = innstreymi (+), credit = útstreymi (-).
      // Þetta kemur í veg fyrir að mótbókunarlínan með gagnstæðu formerki
      // verði tekin sem sami bankahreyfingarkandídat.
      const bookingAmount = booking.debit - booking.credit;
      const bookingMinor = toMinorUnits(bookingAmount);

      if (
        bookingMinor === null ||
        bookingMinor !== bankMinor
      ) {
        continue;
      }

      const partyMatch = partiesMatch(
        bank.text,
        booking.partyText
      );
      const distance = booking.date
        ? daysBetween(bank.date, booking.date)
        : null;

      let strength: CandidateStrength | null = null;
      let reason: CandidateReason | null = null;

      if (distance === 0 && partyMatch) {
        strength = "STRONG";
        reason = "EXACT_DATE_AMOUNT_PARTY";
      } else if (distance === 0) {
        strength = "POSSIBLE";
        reason = "EXACT_DATE_AMOUNT";
      } else if (distance !== null && distance <= 3 && partyMatch) {
        strength = "POSSIBLE";
        reason = "NEAR_DATE_AMOUNT_PARTY";
      } else if (
        distance !== null &&
        distance >= 4 &&
        distance <= 30 &&
        partyMatch
      ) {
        strength = "POSSIBLE";
        reason = "EXTENDED_DATE_AMOUNT_PARTY";
      } else if (distance === null && partyMatch) {
        strength = "POSSIBLE";
        reason = "NO_DATE_AMOUNT_PARTY";
      }

      if (!strength || !reason) continue;

      rawCandidates.push({
        bankTransactionId: bank.id,
        receiptEntryId: booking.entryId,
        receiptId: booking.receiptId,
        voucherNumber: booking.voucherNumber,
        account: booking.account,
        entryText: booking.entryText,
        description: booking.description,
        bankAmount: Number(bank.amount),
        bookingAmount,
        dateDistanceDays: distance,
        partyMatch,
        strength,
        reason,
        mutuallyUnique: false,
      });
    }
  }

  const strongByBank = new Map<number, BankBookingCandidate[]>();
  const strongByEntry = new Map<number, BankBookingCandidate[]>();

  for (const candidate of rawCandidates) {
    if (candidate.strength !== "STRONG") continue;

    strongByBank.set(candidate.bankTransactionId, [
      ...(strongByBank.get(candidate.bankTransactionId) ?? []),
      candidate,
    ]);

    strongByEntry.set(candidate.receiptEntryId, [
      ...(strongByEntry.get(candidate.receiptEntryId) ?? []),
      candidate,
    ]);
  }

  const resolvedCandidates = rawCandidates.map((candidate) => ({
    ...candidate,
    mutuallyUnique:
      candidate.strength === "STRONG" &&
      (strongByBank.get(candidate.bankTransactionId)?.length ?? 0) === 1 &&
      (strongByEntry.get(candidate.receiptEntryId)?.length ?? 0) === 1,
  }));

  return bankTransactions.map((bank) => {
    const all = resolvedCandidates
      .filter(
        (candidate) =>
          candidate.bankTransactionId === bank.id
      )
      .sort(
        (a, b) =>
          Number(b.strength === "STRONG") -
            Number(a.strength === "STRONG") ||
          (a.dateDistanceDays ?? Number.POSITIVE_INFINITY) -
            (b.dateDistanceDays ?? Number.POSITIVE_INFINITY) ||
          a.receiptEntryId - b.receiptEntryId
      );

    const strongCandidates = all.filter(
      (candidate) => candidate.strength === "STRONG"
    );

    const possibleCandidates = all.filter(
      (candidate) => candidate.strength === "POSSIBLE"
    );

    let state: BankCandidateState = "NONE";

    if (
      strongCandidates.length === 1 &&
      strongCandidates[0].mutuallyUnique
    ) {
      state = "UNIQUE_STRONG";
    } else if (strongCandidates.length > 0) {
      // Þetta nær líka yfir mikilvæga tilfellið þar sem einn banki
      // hefur einn sterkan kandidat en sama ReceiptEntry passar við
      // fleiri en eina bankafærslu. Þá má ekki giska.
      state = "AMBIGUOUS_STRONG";
    } else if (possibleCandidates.length > 0) {
      state = "POSSIBLE";
    }

    return {
      bankTransactionId: bank.id,
      state,
      strongCandidates,
      possibleCandidates,
    };
  });
}