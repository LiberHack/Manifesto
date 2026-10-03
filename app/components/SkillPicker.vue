<script setup lang="ts">
import { useId } from "vue";
import { MAX_NEW_SKILLS, MAX_SKILLS } from "#shared/skills";

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    allowCreate?: boolean;
    /**
     * "personal" spends the account's lifetime allowance of new catalogue
     * skills; "team" (wanted skills) has its own allowance per list.
     */
    budget?: "personal" | "team";
  }>(),
  { allowCreate: false, budget: "personal" },
);
const emit = defineEmits<{ "update:modelValue": [string[]] }>();

const listboxId = useId();
const addOptionId = `${listboxId}-add`;

const { data: allSkills } = await useFetch<{ name: string }[]>("/api/skills");
const user = useSupabaseUser();

const query = ref("");
const open = ref(false);
const activeIndex = ref(-1);
const listEl = ref<HTMLUListElement | null>(null);

// New skills reach the catalogue only when the form is saved, so the ones
// already added on earlier saves count, plus every selected skill the
// catalogue does not have yet.
const savedNewCount = ref(0);
if (props.allowCreate && props.budget === "personal" && user.value) {
  const { data } = await useFetch<{ count: number }>("/api/me/skills-count");
  savedNewCount.value = data.value?.count ?? 0;
}

const catalogueKeys = computed(
  () => new Set((allSkills.value ?? []).map((s) => s.name.toLowerCase())),
);
const pendingNewCount = computed(
  () =>
    props.modelValue.filter((s) => !catalogueKeys.value.has(s.toLowerCase()))
      .length,
);
const createdLeft = computed(() =>
  Math.max(0, MAX_NEW_SKILLS - savedNewCount.value - pendingNewCount.value),
);
const isFull = computed(() => props.modelValue.length >= MAX_SKILLS);
const overBy = computed(() => props.modelValue.length - MAX_SKILLS);

function isSelected(name: string) {
  return props.modelValue.includes(name);
}

const isAlreadySelected = computed(() => {
  const q = query.value.trim().toLowerCase();
  return props.modelValue.some((s) => s.toLowerCase() === q);
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];

  return (allSkills.value ?? []).filter(
    (s) => !isSelected(s.name) && s.name.toLowerCase().includes(q),
  );
});

const exactMatch = computed(() => {
  const q = query.value.trim().toLowerCase();
  return (
    (allSkills.value ?? []).find((s) => s.name.toLowerCase() === q) ?? null
  );
});

const showAddNew = computed(
  () =>
    props.allowCreate &&
    createdLeft.value > 0 &&
    !!query.value.trim() &&
    !exactMatch.value &&
    !isAlreadySelected.value,
);

const itemCount = computed(
  () => filtered.value.length + (showAddNew.value ? 1 : 0),
);

watch([filtered, query], () => {
  activeIndex.value = -1;
});

function select(name: string) {
  if (!isSelected(name) && !isFull.value)
    emit("update:modelValue", [...props.modelValue, name]);
  query.value = "";
  open.value = false;
  activeIndex.value = -1;
}

function remove(name: string) {
  emit(
    "update:modelValue",
    props.modelValue.filter((s) => s !== name),
  );
}

function addNew() {
  if (showAddNew.value) select(query.value.trim());
}

function onInput() {
  open.value = true;
}

function onBlur() {
  setTimeout(() => {
    open.value = false;
    activeIndex.value = -1;
  }, 150);
}

function onEnter() {
  if (activeIndex.value >= 0 && activeIndex.value < filtered.value.length) {
    select(filtered.value[activeIndex.value]!.name);
  } else if (activeIndex.value === filtered.value.length && showAddNew.value) {
    addNew();
  } else if (exactMatch.value && !isAlreadySelected.value) {
    select(exactMatch.value.name);
  } else if (showAddNew.value) {
    addNew();
  } else if (isAlreadySelected.value) {
    query.value = "";
    open.value = false;
  }
}

function onArrow(dir: 1 | -1) {
  if (!open.value) {
    open.value = true;
    return;
  }
  const next = activeIndex.value + dir;
  activeIndex.value = Math.max(-1, Math.min(next, itemCount.value - 1));
  nextTick(() => {
    listEl.value?.children[activeIndex.value]?.scrollIntoView({
      block: "nearest",
    });
  });
}

function optionId(i: number) {
  return `${listboxId}-option-${i}`;
}

const activeDescendant = computed(() => {
  if (activeIndex.value < 0) return undefined;
  if (activeIndex.value < filtered.value.length)
    return optionId(activeIndex.value);
  if (activeIndex.value === filtered.value.length && showAddNew.value)
    return addOptionId;
  return undefined;
});
</script>

<template>
  <div class="space-y-2">
    <div v-if="modelValue.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="skill in modelValue"
        :key="skill"
        class="badge badge-primary gap-1"
      >
        {{ skill }}
        <button
          type="button"
          class="cursor-pointer hover:opacity-70"
          :aria-label="`Remove ${skill}`"
          @click="remove(skill)"
        >
          ✕
        </button>
      </span>
    </div>

    <div class="relative">
      <input
        v-model="query"
        type="text"
        :placeholder="isFull ? `Maximum of ${MAX_SKILLS} skills reached` : 'Search or add a skill…'"
        :disabled="isFull"
        maxlength="30"
        class="input input-bordered input-sm w-full"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="listboxId"
        :aria-activedescendant="activeDescendant"
        @input="onInput"
        @focus="onInput"
        @blur="onBlur"
        @keydown.enter.prevent="onEnter"
        @keydown.escape="open = false"
        @keydown.down.prevent="onArrow(1)"
        @keydown.up.prevent="onArrow(-1)"
      />

      <ul
        v-if="open && itemCount > 0"
        :id="listboxId"
        ref="listEl"
        role="listbox"
        class="absolute z-50 mt-1 w-full bg-base-100 border border-base-300 rounded shadow-lg max-h-48 overflow-y-auto"
      >
        <li
          v-for="(skill, i) in filtered"
          :id="optionId(i)"
          :key="skill.name"
          role="option"
          :aria-selected="activeIndex === i"
          class="px-3 py-1.5 cursor-pointer flex items-center justify-between text-sm transition-colors"
          :class="
            activeIndex === i
              ? 'bg-primary text-primary-content'
              : 'hover:bg-base-200'
          "
          @mousedown.prevent="select(skill.name)"
          @mousemove="activeIndex = i"
        >
          {{ skill.name }}
        </li>

        <li
          v-if="showAddNew"
          :id="addOptionId"
          role="option"
          :aria-selected="activeIndex === filtered.length"
          class="px-3 py-1.5 cursor-pointer text-sm font-bold border-t border-base-300 transition-colors"
          :class="
            activeIndex === filtered.length
              ? 'bg-primary text-primary-content'
              : 'hover:bg-base-200'
          "
          @mousedown.prevent="addNew"
          @mousemove="activeIndex = filtered.length"
        >
          + Add "{{ query.trim() }}"
        </li>
      </ul>
    </div>

    <p class="text-xs opacity-60">
      {{ modelValue.length }}/{{ MAX_SKILLS }} skills<template v-if="allowCreate">
        · {{ createdLeft }} new skill{{ createdLeft === 1 ? "" : "s" }} left to add</template>
    </p>

    <p v-if="overBy > 0" role="alert" class="text-xs text-error">
      Remove {{ overBy }} skill{{ overBy === 1 ? "" : "s" }} — at most
      {{ MAX_SKILLS }} are allowed.
    </p>
  </div>
</template>
