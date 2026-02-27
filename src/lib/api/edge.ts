import { supabase } from "@/lib/supabase";

type InvokeOptions<TBody> = {
  functionName: string;
  body: TBody;
};

export async function invokeAuthedFunction<TBody, TResult>({
  functionName,
  body,
}: InvokeOptions<TBody>): Promise<TResult> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("Not signed in (missing access_token). Cannot call protected Edge Function.");
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw error;
  return data as TResult;
}