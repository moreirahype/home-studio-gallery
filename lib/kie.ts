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
  contextFinal,
  callbackUrl,
}: {
  prompt: string;
  sourceImageUrl: string;
  contextFinal: string;
  callbackUrl: string;
}) {
  const apiKey = process.env.KIE_API_KEY;

  if (!apiKey) {
    throw new Error("KIE_API_KEY não configurada.");
  }

  const model =
    process.env.KIE_IMAGE_MODEL ??
    process.env.KIE_MODEL ??
    "gpt-image-2-image-to-image";

  if (model.includes("text-to-image")) {
    throw new Error(
      `KIE_MODEL precisa ser image-to-image/edit para usar foto de referencia. Valor atual: ${model}`,
    );
  }

  const response = await fetch(`${KIE_API_URL}/jobs/createTask`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      callBackUrl: callbackUrl,
      input: {
        prompt: `${prompt}

Mandatory reference instructions:
- Use the image in input_urls as the person's identity reference.
- Keep the same face, facial structure, skin tone, age, expression style and recognizable identity.
- Do not invent a different person.
- Theme/context requested by the client: ${contextFinal}`,
        input_urls: [sourceImageUrl],
        aspect_ratio: "auto",
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

export async function createVideoTask({
  prompt,
  imageUrl,
  callbackUrl,
}: {
  prompt: string;
  imageUrl: string;
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
      model:
        process.env.KIE_VIDEO_MODEL ??
        "bytedance/v1-pro-fast-image-to-video",
      callBackUrl: callbackUrl,
      input: {
        prompt,
        image_url: imageUrl,
        resolution: "720p",
        duration: "5",
        nsfw_checker: true,
      },
    }),
  });
  const result = (await response.json()) as CreateTaskResponse;
  const taskId = result.data?.taskId;

  if (!response.ok || result.code !== 200 || !taskId) {
    throw new Error(
      `KIE recusou o vídeo: ${result.msg || `HTTP ${response.status}`}`,
    );
  }

  return taskId;
}
