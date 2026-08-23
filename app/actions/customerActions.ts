"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createCustomer(data: {
  name: string;
  kennitala: string;
  email: string;
  phone: string;
  address: string;
}) {
  await prisma.customer.create({
    data,
  });

  revalidatePath("/vidskiptavinir");
}

export async function updateCustomer(
  id: number,
  data: {
    name: string;
    kennitala: string;
    email: string;
    phone: string;
    address: string;
  }
) {
  await prisma.customer.update({
    where: {
      id,
    },
    data,
  });

  revalidatePath("/vidskiptavinir");
  revalidatePath(`/vidskiptavinir/${id}`);
}
export async function deleteCustomer(id: number) {
  await prisma.customer.delete({
    where: {
      id,
    },
  });

  revalidatePath("/vidskiptavinir");
}