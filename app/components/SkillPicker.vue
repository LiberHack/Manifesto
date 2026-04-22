<script setup lang="ts">
const props = defineProps<{ modelValue: string[], allowCreate?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const MAX_CREATED = 5

const { data: allSkills } = await useFetch<{ name: string }[]>('/api/skills')

const query = ref('')
const open = ref(false)
const activeIndex = ref(-1)
const userCreatedCount = ref(0)
const listEl = ref<HTMLUListElement | null>(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return (allSkills.value ?? []).filter(s => s.name.toLowerCase().includes(q))
})

const exactMatch = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (allSkills.value ?? []).find(s => s.name.toLowerCase() === q) ?? null
})

const canCreateMore = computed(() => props.allowCreate && userCreatedCount.value < MAX_CREATED)
const createdLeft = computed(() => MAX_CREATED - userCreatedCount.value)

// Total navigable items: filtered skills + optional "Add new" row
const itemCount = computed(() => filtered.value.length + (query.value.trim() && !exactMatch.value && canCreateMore.value ? 1 : 0))

watch([filtered, query], () => { activeIndex.value = -1 })

function isSelected(name: string) {
  return props.modelValue.includes(name)
}

function select(name: string) {
  if (!isSelected(name)) emit('update:modelValue', [...props.modelValue, name])
  query.value = ''
  open.value = false
  activeIndex.value = -1
}

function remove(name: string) {
  emit('update:modelValue', props.modelValue.filter(s => s !== name))
}

function addNew() {
  const name = query.value.trim()
  if (!name || !canCreateMore.value) return
  userCreatedCount.value++
  select(name)
}

function onInput() {
  open.value = true
}

function onBlur() {
  setTimeout(() => { open.value = false; activeIndex.value = -1 }, 150)
}

function onEnter() {
  if (activeIndex.value >= 0 && activeIndex.value < filtered.value.length) {
    select(filtered.value[activeIndex.value].name)
  } else if (activeIndex.value === filtered.value.length && canCreateMore.value && !exactMatch.value) {
    addNew()
  } else if (exactMatch.value) {
    select(exactMatch.value.name)
  } else {
    addNew()
  }
}

function onArrow(dir: 1 | -1) {
  if (!open.value) { open.value = true; return }
  const next = activeIndex.value + dir
  activeIndex.value = Math.max(-1, Math.min(next, itemCount.value - 1))
  nextTick(() => {
    listEl.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' })
  })
}
</script>

<template>
  <div class="space-y-2">
    <!-- Selected skills as removable tags -->
    <div v-if="modelValue.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="skill in modelValue"
        :key="skill"
        class="badge badge-primary gap-1"
      >
        {{ skill }}
        <button type="button" class="cursor-pointer hover:opacity-70" @click="remove(skill)">✕</button>
      </span>
    </div>

    <!-- Search input -->
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

      <!-- Dropdown -->
      <ul
        v-if="open && (filtered.length || (query.trim() && canCreateMore))"
        ref="listEl"
        class="absolute z-50 mt-1 w-full bg-base-100 border border-base-300 rounded shadow-lg max-h-48 overflow-y-auto"
      >
        <li
          v-for="(skill, i) in filtered"
          :key="skill.name"
          class="px-3 py-1.5 cursor-pointer flex items-center justify-between text-sm transition-colors"
          :class="[
            isSelected(skill.name) ? 'opacity-40 pointer-events-none' : 'hover:bg-base-200',
            activeIndex === i ? 'bg-primary text-primary-content' : '',
          ]"
          @mousedown.prevent="select(skill.name)"
          @mousemove="activeIndex = i"
        >
          {{ skill.name }}
          <span v-if="isSelected(skill.name)" class="text-xs opacity-60">added</span>
        </li>

        <!-- Add new option -->
        <li
          v-if="query.trim() && !exactMatch && canCreateMore"
          class="px-3 py-1.5 cursor-pointer text-sm font-bold border-t border-base-300 transition-colors"
          :class="activeIndex === filtered.length ? 'bg-primary text-primary-content' : 'hover:bg-base-200'"
          @mousedown.prevent="addNew"
          @mousemove="activeIndex = filtered.length"
        >
          + Add "{{ query.trim() }}"
        </li>
      </ul>
    </div>

    <!-- Cap indicator -->
    <p v-if="allowCreate" class="text-xs opacity-60">
      {{ createdLeft }} new skill{{ createdLeft === 1 ? '' : 's' }} left to add
    </p>

  </div>
</template>
