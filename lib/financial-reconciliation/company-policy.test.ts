import assert from "node:assert/strict";
import test from "node:test";
import { resolveCompanyReconciliationPolicy } from "./company-policy";

test("unconfirmed company context stays informational instead of guessing from kennitala", () => {
  const policy = resolveCompanyReconciliationPolicy({
    taxIdentityType: "UNCONFIRMED",
    personalBusinessUse: "UNCONFIRMED",
  });
  assert.equal(policy.mode, "INFORMATIONAL");
  assert.equal(policy.source, "SAFE_DEFAULT");
  assert.equal(policy.context, "UNCONFIRMED");
  assert.equal(policy.allowsPersonalTransactionExclusion, false);
});

test("confirmed legal entity defaults to required reconciliation coverage", () => {
  const policy = resolveCompanyReconciliationPolicy({
    taxIdentityType: "LEGAL_ENTITY",
    personalBusinessUse: "UNCONFIRMED",
  });
  assert.equal(policy.mode, "REQUIRED");
  assert.equal(policy.source, "COMPANY_PROFILE");
  assert.equal(policy.context, "LEGAL_ENTITY_BUSINESS");
});

test("individual business-only context defaults to required coverage", () => {
  const policy = resolveCompanyReconciliationPolicy({
    taxIdentityType: "INDIVIDUAL",
    personalBusinessUse: "BUSINESS_ONLY",
  });
  assert.equal(policy.mode, "REQUIRED");
  assert.equal(policy.context, "INDIVIDUAL_BUSINESS");
  assert.equal(policy.allowsPersonalTransactionExclusion, false);
});

test("individual mixed-use context stays informational and enables personal exclusion", () => {
  const policy = resolveCompanyReconciliationPolicy({
    taxIdentityType: "INDIVIDUAL",
    personalBusinessUse: "MIXED_USE",
  });
  assert.equal(policy.mode, "INFORMATIONAL");
  assert.equal(policy.context, "INDIVIDUAL_MIXED_USE");
  assert.equal(policy.isMixedUse, true);
  assert.equal(policy.allowsPersonalTransactionExclusion, true);
});

test("explicit coverage override wins but does not erase mixed-use context", () => {
  const policy = resolveCompanyReconciliationPolicy({
    taxIdentityType: "INDIVIDUAL",
    personalBusinessUse: "MIXED_USE",
    reconciliationCoverageOverride: "REQUIRED",
  });
  assert.equal(policy.mode, "REQUIRED");
  assert.equal(policy.source, "OVERRIDE");
  assert.equal(policy.isMixedUse, true);
  assert.equal(policy.allowsPersonalTransactionExclusion, true);
});

test("excluded override is explicit and auditable rather than inferred", () => {
  const policy = resolveCompanyReconciliationPolicy({
    taxIdentityType: "LEGAL_ENTITY",
    reconciliationCoverageOverride: "EXCLUDED",
  });
  assert.equal(policy.mode, "EXCLUDED");
  assert.equal(policy.source, "OVERRIDE");
});

test("invalid legacy values fail safely to informational", () => {
  const policy = resolveCompanyReconciliationPolicy({
    taxIdentityType: "PERSON_MAYBE",
    personalBusinessUse: "SOMETIMES",
    reconciliationCoverageOverride: "STRICT",
  });
  assert.equal(policy.mode, "INFORMATIONAL");
  assert.equal(policy.source, "SAFE_DEFAULT");
  assert.equal(policy.taxIdentityType, "UNCONFIRMED");
  assert.equal(policy.personalBusinessUse, "UNCONFIRMED");
});
