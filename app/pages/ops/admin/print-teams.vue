<script setup lang="ts">
definePageMeta({ middleware: ["admin"], layout: false });

const { data: teams } = await useFetch<{ id: string; name: string }[]>("/api/admin/teams");
</script>

<template>
  <div class="print-root">
    <div
      v-for="team in teams"
      :key="team.id"
      class="team-page"
    >
      <span class="team-name">{{ team.name }}</span>
      <img src="/Liberhack_Logo_Bright_nobg.png" class="logo" alt="LiberHack" />
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #fff;
}

.print-root {
  font-family: "cygrotesk", sans-serif;
}

.team-page {
  width: 100%;
  height: 210mm;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  page-break-after: always;
  break-after: page;
}

.logo {
  position: absolute;
  bottom: 12mm;
  left: 12mm;
  height: 42mm;
  width: auto;
}

.team-page:last-child {
  page-break-after: avoid;
  break-after: avoid;
}

.team-name {
  font-size: 72pt;
  font-weight: 700;
  color: #000;
  text-align: center;
  line-height: 1.1;
  word-break: break-word;
  padding: 0 24mm;
}

@media screen {
  .print-root {
    background: #e5e5e5;
    padding: 20px;
    gap: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .team-page {
    background: #fff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  }
}

</style>
