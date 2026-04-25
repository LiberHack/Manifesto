<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });
await navigateTo("/ops/teams");
</script>
