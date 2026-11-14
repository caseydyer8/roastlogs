// User-owned localStorage caches (NOT device preferences like theme/units),
// set aside when a different account signs in. Kept in its own tiny module so a
// unit test can import it without pulling in the Supabase client.
import { PENDING_UPLOADS_KEY } from "./pendingUploads";

export const SYNCED_DATA_KEYS = ["roasts", "tastingNotes", "beans"];
// PENDING_UPLOADS_KEY (RL-076) is the list of roasts awaiting upload; it must be
// set aside with the roasts so account B can never upload account A's roast.
// Deliberately not a live_ key (those are purged, not quarantined).
export const USER_DATA_KEYS = [...SYNCED_DATA_KEYS, "global_profiles", PENDING_UPLOADS_KEY];
