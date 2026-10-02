<script setup lang="ts">
// Cell labels come from labelContentTableCells() before SSR.
defineOptions({ inheritAttrs: false });
</script>

<template>
  <div class="content-table min-w-0 max-w-full overflow-x-auto">
    <table v-bind="$attrs"><slot /></table>
  </div>
</template>

<style>
@media (max-width: 639px) {
  .content-table table,
  .content-table tbody,
  .content-table tr,
  .content-table td {
    display: block !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
  }

  .content-table table {
    margin: 0;
  }

  .content-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .content-table tbody tr {
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--color-primary);
    background: var(--color-base-100);
  }

  .content-table tbody td {
    padding: 0.5rem 0 !important;
    border: 0 !important;
    overflow-wrap: break-word;
    white-space: normal;
  }

  .content-table tbody td + td {
    border-top: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent) !important;
  }

  .content-table tbody td::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    opacity: 0.7;
  }
}
</style>
