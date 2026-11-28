"use server";

/**
 * Legacy Customer has no companyId. Its former CRUD implementation could
 * read/write cross-company personal data. Fail closed until a reviewed
 * company-scoped customer model and data migration are available.
 * This does not remove or modify any existing Customer records.
 */
export type LegacyCustomerInput = {
  name: string;
  kennitala: string;
  email: string;
  phone: string;
  address: string;
};

function legacyCustomerDisabled(): never {
  throw new Error("Eldra viðskiptamannasvæðið er tímabundið lokað þar til fyrirtækjaaðgreining er tryggð.");
}

export async function createCustomer(_data: LegacyCustomerInput): Promise<never> {
  return legacyCustomerDisabled();
}

export async function updateCustomer(_id: number, _data: LegacyCustomerInput): Promise<never> {
  return legacyCustomerDisabled();
}

export async function deleteCustomer(_id: number): Promise<never> {
  return legacyCustomerDisabled();
}
