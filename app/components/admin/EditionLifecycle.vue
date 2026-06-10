<script setup lang="ts">
const { data: current, refresh } = await useFetch<{ slug: string; name: string; status: string } | null>('/api/editions/current')

const draftForm = reactive({ slug: '', name: '', starts_at: '', ends_at: '' })
const error = ref('')
const loading = ref(false)

async function closeEdition() {
  if (!current.value) return
  if (!confirm(`Archive "${current.value.name}"? This cannot be undone.`)) return
  loading.value = true
  try {
    await $fetch('/api/admin/editions/close', { method: 'POST', body: { slug: current.value.slug } })
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed'
  } finally { loading.value = false }
}

async function createDraft() {
  if (!draftForm.slug.trim() || !draftForm.name.trim()) { error.value = 'Slug and name are required'; return }
  loading.value = true
  try {
    await $fetch('/api/admin/editions/draft', { method: 'POST', body: { ...draftForm } })
    await refresh()
    Object.assign(draftForm, { slug: '', name: '', starts_at: '', ends_at: '' })
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed'
  } finally { loading.value = false }
}

async function goLive(slug: string) {
  if (!confirm(`Go live with "${slug}"?`)) return
  loading.value = true
  try {
    await $fetch('/api/admin/editions/go-live', { method: 'POST', body: { slug } })
    await refresh()
  } catch (e: unknown) {
    error.value = (e as { data?: { message?: string } }).data?.message ?? 'Failed'
  } finally { loading.value = false }
}
</script>

<template>
  <section class="space-y-6">
    <h2 class="text-xl font-black uppercase tracking-tight">Edition Lifecycle</h2>
    <div v-if="error" class="alert alert-error text-sm">{{ error }}</div>

    <!-- Current edition -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body">
        <h3 class="font-bold">Current Edition</h3>
        <p v-if="current" class="font-mono">{{ current.slug }} — {{ current.name }}</p>
        <p v-else class="text-base-content/50 text-sm">No active edition (dormant mode).</p>
        <div v-if="current" class="card-actions">
          <button class="btn btn-sm btn-warning" :disabled="loading" @click="closeEdition">
            Close & Archive
          </button>
        </div>
      </div>
    </div>

    <!-- Create draft -->
    <div class="card bg-base-200 border border-base-300">
      <div class="card-body space-y-3">
        <h3 class="font-bold">Create Draft Edition</h3>
        <input v-model="draftForm.slug" class="input input-bordered w-full" placeholder="Slug (e.g. 2027)" />
        <input v-model="draftForm.name" class="input input-bordered w-full" placeholder="Name (e.g. LiberHack 2027)" />
        <input v-model="draftForm.starts_at" type="datetime-local" class="input input-bordered w-full" />
        <input v-model="draftForm.ends_at" type="datetime-local" class="input input-bordered w-full" />
        <button class="btn btn-sm btn-primary" :disabled="loading" @click="createDraft">
          Create Draft
        </button>
      </div>
    </div>

    <!-- Draft editions list -->
    <AdminDraftEditionsList @go-live="goLive" />
  </section>
</template>
