<script setup lang="ts">
import {
  CONTRIBUTION_ROLE_LABELS,
  formatGoals,
  PROFILE_LINK_FIELDS,
  PROFILE_LINK_LABELS,
  type PublicProfile,
} from "#shared/teamFormation";

const props = defineProps<{ profile: PublicProfile }>();

// Rendered as links only when they are http(s); anything else stays text.
const links = computed(() =>
  PROFILE_LINK_FIELDS.flatMap((field) => {
    const url = props.profile[field];
    if (!url) return [];
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return [];
    } catch {
      return [];
    }
    return [{ field, url, label: PROFILE_LINK_LABELS[field] }];
  }),
);
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="font-bold">{{ profile.name }}</span>
      <span v-if="profile.experience" class="badge badge-sm badge-ghost">{{ profile.experience }}</span>
    </div>
    <p v-if="profile.intro" class="text-sm whitespace-pre-line">{{ profile.intro }}</p>
    <div v-if="profile.preferred_roles.length" class="flex gap-1 flex-wrap">
      <span v-for="role in profile.preferred_roles" :key="role" class="badge badge-sm badge-primary badge-outline">
        {{ CONTRIBUTION_ROLE_LABELS[role] }}
      </span>
    </div>
    <div v-if="profile.skills.length" class="flex gap-1 flex-wrap">
      <span v-for="skill in profile.skills" :key="skill" class="badge badge-xs badge-outline">{{ skill }}</span>
    </div>
    <p v-if="profile.interests.length || profile.goals.length" class="text-xs opacity-70">
      <template v-if="profile.interests.length">Interests: {{ profile.interests.join(", ") }}</template>
      <template v-if="profile.interests.length && profile.goals.length"> · </template>
      <template v-if="profile.goals.length">
        Goals: {{ formatGoals(profile.goals) }}
      </template>
    </p>
    <p v-if="profile.languages.length" class="text-xs opacity-70">
      Languages: {{ profile.languages.join(", ") }}
    </p>
    <div v-if="links.length" class="flex gap-3 flex-wrap text-xs">
      <a
        v-for="link in links"
        :key="link.field"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer nofollow"
        class="link"
      >{{ link.label }}</a>
    </div>
  </div>
</template>
