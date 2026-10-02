<script setup lang="ts">
import { renderSVG } from "uqr";
import { SOURCE_CHANNELS } from "#shared/utils/source";

interface SourceLink {
  id: string;
  tag: string;
  label: string;
  note: string | null;
  channel: string;
  active: boolean;
  created_at: string;
  archived_at: string | null;
}

const props = defineProps<{ editionQuery: { edition?: string }; readOnly: boolean }>();
const query = computed(() => props.editionQuery);
const { data: links, refresh } = await useFetch<SourceLink[]>("/api/admin/sources/links", { query });

const origin = useRequestURL().origin;
const fullLink = (tag: string) => `${origin}/?src=${tag}`;
const shortLink = (tag: string) => `${origin}/go/${tag}`;

const form = reactive({ tag: "", label: "", note: "", channel: "poster" });
const error = ref("");

async function create() {
  error.value = "";
  try {
    await $fetch("/api/admin/sources/links", {
      method: "POST",
      query: props.editionQuery,
      body: { ...form, tag: form.tag.trim().toLowerCase() },
    });
    Object.assign(form, { tag: "", label: "", note: "" });
    await refresh();
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? "Failed to create";
  }
}

async function patch(link: SourceLink, body: Record<string, unknown>, confirmText?: string) {
  if (confirmText && !confirm(confirmText)) return;
  await $fetch(`/api/admin/sources/links/${link.id}`, { method: "PATCH", body });
  await refresh();
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

// QR codes are generated in the browser — the link never goes to a third party.
function qrSvg(tag: string): string {
  return renderSVG(shortLink(tag), { ecc: "M", pixelSize: 12, border: 2 });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function downloadSvg(tag: string) {
  download(new Blob([qrSvg(tag)], { type: "image/svg+xml" }), `liberhack-${tag}.svg`);
}

function downloadPng(tag: string) {
  const img = new Image();
  img.onload = () => {
    const scale = 4;
    const canvas = Object.assign(document.createElement("canvas"), {
      width: img.width * scale,
      height: img.height * scale,
    });
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && download(blob, `liberhack-${tag}.png`), "image/png");
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(tag))}`;
}

const shownQr = ref<string | null>(null);
</script>

<template>
  <div class="flex flex-col gap-3">
    <h3 class="font-black text-lg uppercase">Links</h3>
    <p class="text-sm opacity-70 max-w-3xl">
      Only links created here are counted. Tags are permanent: they cannot be
      renamed, deleted or reused, so a printed poster always means the same
      thing. Disable a link to stop counting it; archive it when it is retired
      for good. History is kept either way.
    </p>

    <form v-if="!readOnly" class="flex flex-wrap items-end gap-2" @submit.prevent="create">
      <label class="form-control">
        <span class="label-text font-bold">Tag</span>
        <input v-model="form.tag" required pattern="[a-z0-9][a-z0-9\-]{1,47}" placeholder="poster-fmi" class="input input-bordered input-sm w-40 font-mono" />
      </label>
      <label class="form-control">
        <span class="label-text font-bold">Label</span>
        <input v-model="form.label" required maxlength="80" placeholder="FMI poster, 2nd floor" class="input input-bordered input-sm w-56" />
      </label>
      <label class="form-control">
        <span class="label-text font-bold">Channel</span>
        <select v-model="form.channel" class="select select-bordered select-sm">
          <option v-for="c in SOURCE_CHANNELS" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="form-control">
        <span class="label-text font-bold">Note</span>
        <input v-model="form.note" maxlength="300" class="input input-bordered input-sm w-56" />
      </label>
      <button type="submit" class="btn btn-primary btn-sm">Create link</button>
      <span v-if="error" role="alert" class="text-error text-sm">{{ error }}</span>
    </form>

    <div class="overflow-x-auto">
      <table class="table table-sm">
        <thead>
          <tr><th>Tag</th><th>Label</th><th>Channel</th><th>Links</th><th>QR</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr v-if="!links?.length"><td colspan="6" class="opacity-60">No links yet.</td></tr>
          <tr v-for="link in links" :key="link.id" :class="{ 'opacity-50': !link.active }">
            <td class="font-mono">{{ link.tag }}</td>
            <td>{{ link.label }}<div v-if="link.note" class="text-xs opacity-60">{{ link.note }}</div></td>
            <td>{{ link.channel }}</td>
            <td class="text-xs">
              <button type="button" class="link block" @click="copy(fullLink(link.tag))">Copy full link</button>
              <button type="button" class="link block" @click="copy(shortLink(link.tag))">Copy short link</button>
            </td>
            <td class="text-xs">
              <button type="button" class="link block" @click="shownQr = shownQr === link.tag ? null : link.tag">Preview</button>
              <button type="button" class="link block" @click="downloadSvg(link.tag)">SVG</button>
              <button type="button" class="link block" @click="downloadPng(link.tag)">PNG</button>
              <!-- eslint-disable-next-line vue/no-v-html -- generated locally from our own URL -->
              <div v-if="shownQr === link.tag" class="w-32 bg-white mt-1" v-html="qrSvg(link.tag)" />
            </td>
            <td class="text-xs">
              <span v-if="link.archived_at" class="badge badge-ghost badge-sm">archived</span>
              <template v-else-if="!readOnly">
                <label class="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" class="toggle toggle-xs" :checked="link.active" @change="patch(link, { active: ($event.target as HTMLInputElement).checked })" />
                  {{ link.active ? "counting" : "disabled" }}
                </label>
                <button type="button" class="link" @click="patch(link, { archived: true }, `Archive ${link.tag}? It can never be reactivated or reused.`)">Archive</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
