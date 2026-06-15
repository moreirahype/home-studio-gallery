const KIE_API_URL = "https://api.kie.ai/api/v1";

type CreateTaskResponse = {
  code: number;
  msg: string;
  data?: {
    taskId?: string;
  };
};

type TaskDetailsResponse = {
  code: number;
  msg: string;
  data?: {
    taskId?: string;
    state?: string;
    resultJson?: string;
    failMsg?: string;
  };
};

export async function createImageTask({
  prompt,
  sourceImageUrl,
  callbackUrl,
}: {
  prompt: string;
  sourceImageUrl: string;
  callbackUrl: string;
}) {
  const apiKey = process.env.KIE_API_KEY;

  if (!apiKey) {
    throw new Error("KIE_API_KEY não configurada.");
  }

  const response = await fetch(`${KIE_API_URL}/jobs/createTask`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.KIE_MODEL ?? "gpt-image-2-image-to-image",
      callBackUrl: callbackUrl,
      input: {
        prompt,
        input_urls: [sourceImageUrl],
        aspect_ratio: "3:4",
      },
    }),
  });
  const result = (await response.json()) as CreateTaskResponse;
  const taskId = result.data?.taskId;

  if (!response.ok || result.code !== 200 || !taskId) {
    throw new Error(
      `KIE recusou a geração: ${result.msg || `HTTP ${response.status}`}`,
    );
  }

  return taskId;
}

export async function getTaskDetails(taskId: string) {
  const apiKey = process.env.KIE_API_KEY;

  if (!apiKey) {
    throw new Error("KIE_API_KEY não configurada.");
  }

  const url = new URL(`${KIE_API_URL}/jobs/recordInfo`);
  url.searchParams.set("taskId", taskId);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const result = (await response.json()) as TaskDetailsResponse;

  if (!response.ok || !result.data) {
    throw new Error(
      `Falha ao consultar a KIE: ${result.msg || `HTTP ${response.status}`}`,
    );
  }

  return result.data;
}
