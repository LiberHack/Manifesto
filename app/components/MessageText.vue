<script setup lang="ts">
import { linkify } from "#shared/linkify";

// Renders chat text as text: only http(s) URLs become links, nothing is
// interpreted as HTML.
const props = defineProps<{ text: string }>();
const segments = computed(() => linkify(props.text));
</script>

<template>
  <span class="whitespace-pre-wrap break-words"><template v-for="(s, i) in segments" :key="i"><a
    v-if="s.type === 'link'"
    :href="s.href"
    target="_blank"
    rel="noopener noreferrer nofollow ugc"
    class="link"
  >{{ s.text }}</a><template v-else>{{ s.text }}</template></template></span>
</template>
