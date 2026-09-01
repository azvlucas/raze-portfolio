import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { error: message, details: details ?? undefined },
    { status },
  );
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return jsonError(error.message, error.status);
  }
  if (error instanceof ZodError) {
    return jsonError("Dados inválidos", 400, error.flatten());
  }
  if (error instanceof Error) {
    console.error("[api]", error);
    return jsonError(error.message || "Erro interno", 500);
  }
  console.error("[api]", error);
  return jsonError("Erro interno", 500);
}
