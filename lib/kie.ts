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

export function getKieImageModel() {
  return (
    process.env.KIE_IMAGE_MODEL ??
    process.env.KIE_MODEL ??
    "gpt-image-2-image-to-image"
  );
}

function buildImageInput({
  model,
  prompt,
  sourceImageUrl,
  contextFinal,
}: {
  model: string;
  prompt: string;
  sourceImageUrl: string;
  contextFinal: string;
}) {
  const finalPrompt = `${prompt}

STRICT IDENTITY LOCK:
- The uploaded/reference image is the identity source.
- Preserve the exact same person. Same face shape, eyes, nose, mouth, jawline, skin tone, age, ethnicity, hairline and facial proportions.
- Do not beautify into a different person. Do not change gender, age, facial structure or body type.
- Change only clothing, environment, lighting, pose and styling as needed for the requested theme.
- Client theme/context: ${contextFinal}`;

  if (model === "nano-banana-pro") {
    return {
      prompt: finalPrompt,
      image_input: [sourceImageUrl],
      aspect_ratio: "auto",
      resolution: "1K",
      output_format: "png",
    };
  }

  return {
    prompt: finalPrompt,
    input_urls: [sourceImageUrl],
    aspect_ratio: "auto",
  };
}

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

  const model = getKieImageModel();

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
      input: buildImageInput({ model, prompt, sourceImageUrl, contextFinal }),
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
