"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");

  if (typeof emailValue !== "string" || typeof passwordValue !== "string") {
    redirect("/login?erro=campos-invalidos");
  }

  const email = emailValue.trim();
  const password = passwordValue;

  if (
    !email ||
    !email.includes("@") ||
    email.length > 254 ||
    !password ||
    password.length > 4_096
  ) {
    redirect("/login?erro=campos-invalidos");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?erro=credenciais-invalidas");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
