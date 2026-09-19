GLÖGGT – Verk auðlindir – TypeScript narrowing lagfæring – 19.09.2026

Lagfærir TS2345 í app/verk/[id]/actions.ts við resourceUsageKind(resource.kind).

Ástæða:
Prisma skilar WorkResource.kind sem string og TypeScript varðveitir ekki property-narrowingið
örugglega þegar resource-objektið er fangað inni í async transaction callback.

Lausn:
Eftir isWork10PersistentResourceKind(...) guard er resource.kind sett í local const resourceKind.
Sá const heldur union-týpunni TEAM | MACHINE | VEHICLE | TOOL | CONTRACTOR og er notaður
í defaultResourceUnit, resourceUsageKind og audit metadata.

Engin migration.
