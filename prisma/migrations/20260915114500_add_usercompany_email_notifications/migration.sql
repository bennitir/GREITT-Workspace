-- Tölvupósttilkynningar eru stilltar á UserCompany svo þær fylgi fyrirtækjatengingu notandans.
ALTER TABLE "UserCompany"
ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
