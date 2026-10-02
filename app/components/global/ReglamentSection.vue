<script setup lang="ts">
// Rendered from content/reglament.md via MDC, so the reglament text stays in
// markdown while keeping the page's section styling.
defineProps<{
  /** Anchor id, e.g. "filosofiya" — linked to from the table of contents. */
  id: string;
  /** Two-digit section number shown before the title, e.g. "04". */
  num: string;
  title: string;
}>();
</script>

<template>
  <section
    :id="id"
    class="flex flex-col gap-4 bg-base-100/70 border-primary border-l-4 pl-6 py-4 [&_p]:text-base [&_p]:md:text-lg [&_p]:leading-relaxed [&_strong]:font-bold [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_li]:text-base [&_li]:md:text-lg [&_li]:before:content-['→'] [&_li]:before:mr-2 [&_li]:before:text-primary [&_table]:table [&_table]:table-zebra [&_table]:w-full [&_table]:border-primary [&_table]:border-2 [&_table]:text-sm [&_table]:md:text-base [&_h3]:text-lg [&_h3]:font-bold [&_blockquote]:text-base [&_blockquote]:md:text-lg [&_blockquote]:font-semibold [&_blockquote]:italic [&_th]:text-left [&_th]:border-primary [&_th]:border-b-2 [&_td]:align-top"
  >
    <h2 class="text-2xl md:text-3xl font-bold">{{ num }}. {{ title }}</h2>
    <slot />
  </section>
</template>
