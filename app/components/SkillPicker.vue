<script setup lang="ts">
const props = defineProps<{ modelValue: string[]; allowCreate?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [string[]] }>();

const MAX_CREATED = 5;

const { data: allSkills } = await useFetch<{ name: string }[]>("/api/skills");
const user = useSupabaseUser();

const query = ref("");
const open = ref(false);
const activeIndex = ref(-1);
const userCreatedCount = ref(0);
const addError = ref<string | null>(null);
const listEl = ref<HTMLUListElement | null>(null);

const sessionCreatedSkills = ref<string[]>([]);

if (props.allowCreate && user.value) {
  const { data } = await useFetch<{ count: number }>("/api/me/skills-count");
  if (data.value) userCreatedCount.value = data.value.count;
}

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

const canCreateMore = computed(
  () => props.allowCreate && userCreatedCount.value < MAX_CREATED,
);
const createdLeft = computed(() => MAX_CREATED - userCreatedCount.value);

const showAddNew = computed(() => {
  return (
    !!query.value.trim() &&
    !exactMatch.value &&
    !isAlreadySelected.value &&
    canCreateMore.value
  );
});

const itemCount = computed(
  () => filtered.value.length + (showAddNew.value ? 1 : 0),
);

watch([filtered, query], () => {
  activeIndex.value = -1;
  addError.value = null;
});

function select(name: string) {
  if (!isSelected(name)) emit("update:modelValue", [...props.modelValue, name]);
  query.value = "";
  open.value = false;
  activeIndex.value = -1;
}

function remove(name: string) {
  emit(
    "update:modelValue",
    props.modelValue.filter((s) => s !== name),
  );

  if (sessionCreatedSkills.value.includes(name)) {
    userCreatedCount.value--;
    sessionCreatedSkills.value = sessionCreatedSkills.value.filter(
      (s) => s !== name,
    );
  }
}

async function addNew() {
  const name = query.value.trim();

  if (!name || !canCreateMore.value || isAlreadySelected.value) return;

  if (user.value) {
    try {
      const result = await $fetch<{ name: string }>("/api/skills", {
        method: "POST",
        body: { name },
      });

      userCreatedCount.value++;
      sessionCreatedSkills.value.push(result.name);

      if (
        allSkills.value &&
        !allSkills.value.some(
          (s) => s.name.toLowerCase() === result.name.toLowerCase(),
        )
      ) {
        allSkills.value.push(result);
      }

      select(result.name);
    } catch (e: any) {
      addError.value = e?.data?.message ?? "Could not add skill";
      open.value = false;
    }
  } else {
    userCreatedCount.value++;
    sessionCreatedSkills.value.push(name);

    if (
      allSkills.value &&
      !allSkills.value.some((s) => s.name.toLowerCase() === name.toLowerCase())
    ) {
      allSkills.value.push({ name });
    }
    select(name);
  }
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
    select(filtered.value[activeIndex.value].name);
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
        placeholder="Search or add a skill…"
        maxlength="30"
        class="input input-bordered input-sm w-full"
        autocomplete="off"
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
        ref="listEl"
        class="absolute z-50 mt-1 w-full bg-base-100 border border-base-300 rounded shadow-lg max-h-48 overflow-y-auto"
      >
        <li
          v-for="(skill, i) in filtered"
          :key="skill.name"
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

    <p v-if="allowCreate" class="text-xs opacity-60">
      {{ createdLeft }} new skill{{ createdLeft === 1 ? "" : "s" }} left to add
    </p>

    <p v-if="addError" class="text-xs text-error">{{ addError }}</p>
  </div>
</template>
