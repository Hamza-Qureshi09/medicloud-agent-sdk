# Machine catalogs

The SDK owns the catalog database in the same SQLite file as profiles, orders, and results.

All eight current driver catalogs are stored in SQLite. iFlash 3000, MAGLUMI 800, Sysmex KX-21N, BioLabo Kenza, and DrAccu AFI-6100B were already managed. Roche cobas c111, Bonavera Count, and Bonavera 200 are seeded when their catalog rows are absent. Startup skips any catalog already in the database, so later restarts do not overwrite edits. The analyzer catalog files remain as first-run seed data. The static catalog mechanism remains available for future drivers, but its current list is empty.

The Bonavera 200 seed uses the LIS test names and codes shown in the lab's analyzer settings screenshots. Calcium has code `0` and is enabled. Order codes are kept as strings from the SDK through the agent, MediCloud, and the analyzer message, so `0` is not treated as false. The seed currently advertises each LIS code as its result analyte code too. Compare the first real ORU capture against those analyte codes before relying on automatic result mapping. The SDK continues recording incoming Bonavera 200 assay identifiers in `./data/bonavera200-catalog-captures.jsonl`.

Each managed test has an order code, a display name, one or more result analytes, and optional aliases, device code, unit, normal range, category, slot, and enabled state. Sysmex analytes can also carry category and decimal precision. A disabled test remains editable but is omitted from driver lookup and upstream capabilities. The SDK refuses to update or delete a test when a pending or running local order uses its code.

The agent dashboard at **Test catalogs** can create a catalog for a registered driver that has none, rename a managed catalog, and add, edit, disable, or delete its tests. The Create catalog button stays visible. When all registered drivers already have catalogs, its dialog explains why none can be created yet. The SDK routes are:

- `GET /catalogs` and `GET /catalogs?driver=<id>` retain the existing response shapes.
- `POST /catalogs` creates a managed catalog for a registered driver.
- `PATCH /catalogs/:driverId` changes its display name.
- `POST /catalogs/:driverId/tests` adds a test.
- `PUT /catalogs/:driverId/tests/:code` edits a test without changing its order code.
- `DELETE /catalogs/:driverId/tests/:code` removes a test.

Each direct or slave agent reads its own local SDK catalog when building capabilities. A master reads its own catalog and forwards active slave capabilities without changing their test and analyte payloads. The MediCloud heartbeat reflects catalog edits on the next agent heartbeat. The agent dashboard changes only the catalog in its own SDK database, including when the agent runs in master mode. To edit a slave's catalog, open that slave agent's dashboard.

Before editing a tested mapping, record the analyzer's order code and result assay identifiers. Changing an analyzer wire code can make new orders or result mappings fail. Changes in the local SDK source must be published through the project's existing GitHub SDK delivery process before client agents run this implementation.
