# Machine catalogs

The SDK owns the catalog database in the same SQLite file as profiles, orders, and results.

On first startup after this change, the SDK copies the tested catalog entries for iFlash 3000, MAGLUMI 800, Sysmex KX-21N, BioLabo Kenza, and DrAccu AFI-6100B into `machine_catalogs` and `machine_catalog_tests`. It does not overwrite an existing managed catalog on later starts. The source files remain as first-run seeds and as records of the tested analyzer configuration. Driver lookups for these five machines read SQLite after startup.

Roche cobas c111, Bonavera Count, and Bonavera 200 remain static and read-only. Bonavera 200 still has a discovery placeholder, not verified order codes.

Each managed test has an order code, a display name, one or more result analytes, and optional aliases, device code, unit, normal range, category, slot, and enabled state. Sysmex analytes can also carry category and decimal precision. A disabled test remains editable but is omitted from driver lookup and upstream capabilities. The SDK refuses to update or delete a test when a pending or running local order uses its code.

The agent dashboard at **Test catalogs** can create a catalog for a registered driver that has none, rename a managed catalog, and add, edit, disable, or delete its tests. The SDK routes are:

- `GET /catalogs` and `GET /catalogs?driver=<id>` retain the existing response shapes.
- `POST /catalogs` creates a managed catalog for a registered driver.
- `PATCH /catalogs/:driverId` changes its display name.
- `POST /catalogs/:driverId/tests` adds a test.
- `PUT /catalogs/:driverId/tests/:code` edits a test without changing its order code.
- `DELETE /catalogs/:driverId/tests/:code` removes a test.

Each direct or slave agent reads its own local SDK catalog when building capabilities. A master reads its own catalog and forwards active slave capabilities without changing their test and analyte payloads. The MediCloud heartbeat reflects catalog edits on the next agent heartbeat. The agent dashboard changes only the catalog in its own SDK database, including when the agent runs in master mode. To edit a slave's catalog, open that slave agent's dashboard.

Before editing a tested mapping, record the analyzer's order code and result assay identifiers. Changing an analyzer wire code can make new orders or result mappings fail. Changes in the local SDK source must be published through the project's existing GitHub SDK delivery process before client agents run this implementation.