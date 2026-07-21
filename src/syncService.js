import { supabase } from './supabaseClient';

// Helper function to strip photo/image fields from data
function stripPhotoFields(data) {
  const cleaned = { ...data };
  
  // Remove known photo field names
  const photoFields = ['photo', 'image', 'photoKey', 'brewPhoto', 'base64'];
  photoFields.forEach(field => delete cleaned[field]);
  
  // Remove any field whose value starts with 'data:image'
  Object.keys(cleaned).forEach(key => {
    if (typeof cleaned[key] === 'string' && cleaned[key].startsWith('data:image')) {
      delete cleaned[key];
    }
  });
  
  return cleaned;
}

// Resolve the signed-in user's id for owner-stamping on write. Reads the cached
// session (no network round-trip); returns undefined if not signed in, in which
// case the DB column default (auth.uid()) still stamps the owner server-side.
async function currentUserId() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id;
  } catch (e) {
    return undefined;
  }
}

export async function syncRoastToSupabase(roast) {
  console.log('syncRoastToSupabase called with id:', roast.id)
  try {
    // Strip photo fields before syncing
    const cleanRoast = stripPhotoFields(roast);
    const uid = await currentUserId();
    
    const { data, error } = await supabase
      .from('roasts')
      .upsert({
        id: Number(cleanRoast.id),
        user_id: uid,
        date: cleanRoast.date,
        bean_name: cleanRoast.beanName,
        green_weight: cleanRoast.greenWeight,
        roasted_weight: cleanRoast.roastedWeight,
        target_level: cleanRoast.targetLevel,
        duration: cleanRoast.duration,
        total_seconds: cleanRoast.totalSeconds,
        dev_seconds: cleanRoast.devSeconds,
        starting_settings: cleanRoast.startingSettings,
        roast_log: cleanRoast.roastLog,
        profile: cleanRoast.profile,
      });

    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("Failed to sync roast to Supabase", e);
    return false;
  }
}

export async function deleteRoastFromSupabase(id) {
  try {
    const { error } = await supabase
      .from('roasts')
      .delete()
      .eq('id', Number(id));

    if (error) throw error;
  } catch (e) {
    console.warn("Failed to delete roast from Supabase", e);
  }
}

export async function syncBrewToSupabase(brew) {
  console.log('syncBrewToSupabase called with id:', brew.id)
  try {
    // Strip photo fields before syncing
    const cleanBrew = stripPhotoFields(brew);
    const uid = await currentUserId();
    
    const { data, error } = await supabase
      .from('tasting_notes')
      .upsert({
        id: Number(cleanBrew.id),
        user_id: uid,
        date: cleanBrew.date,
        roast_id: cleanBrew.roastId,
        bean_name: cleanBrew.beanName,
        method: cleanBrew.method,
        device: cleanBrew.device,
        ratio: cleanBrew.ratio,
        grind_size: cleanBrew.grindSize,
        temp: cleanBrew.temp,
        acidity: cleanBrew.acidity,
        body: cleanBrew.body,
        families: cleanBrew.families,
        descriptors: cleanBrew.descriptors,
        rating: cleanBrew.rating,
        brew_again: cleanBrew.brewAgain,
        notes: cleanBrew.notes,
      });

    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("Failed to sync brew to Supabase", e);
    return false;
  }
}

export async function deleteBrewFromSupabase(id) {
  try {
    const { error } = await supabase
      .from('tasting_notes')
      .delete()
      .eq('id', Number(id));

    if (error) throw error;
  } catch (e) {
    console.warn("Failed to delete brew from Supabase", e);
  }
}

export async function fetchBrewsFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('tasting_notes')
      .select('*');

    if (error) {
      console.warn("Supabase error fetching brews:", error);
      return [];
    }

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.map(b => ({
      id: b.id,
      date: b.date,
      roastId: b.roast_id,
      beanName: b.bean_name,
      method: b.method,
      device: b.device,
      ratio: b.ratio,
      grindSize: b.grind_size,
      temp: b.temp,
      acidity: b.acidity,
      body: b.body,
      families: b.families,
      descriptors: b.descriptors,
      rating: b.rating,
      brewAgain: b.brew_again,
      notes: b.notes,
    }));
  } catch (e) {
    console.warn("Failed to fetch brews from Supabase", e);
    return [];
  }
}

export async function fetchRoastsFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('roasts')
      .select('*');

    if (error) {
      console.warn("Supabase error fetching roasts:", error);
      return [];
    }

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.map(r => ({
      id: r.id,
      date: r.date,
      beanName: r.bean_name,
      greenWeight: r.green_weight,
      roastedWeight: r.roasted_weight,
      targetLevel: r.target_level,
      duration: r.duration,
      totalSeconds: r.total_seconds,
      devSeconds: r.dev_seconds,
      startingSettings: r.starting_settings,
      roastLog: r.roast_log,
      profile: r.profile,
    }));
  } catch (e) {
    console.warn("Failed to fetch roasts from Supabase", e);
    return [];
  }
}

// Numeric bean fields (masl, purchaseWeight) are optional text-input state and arrive
// as "" when unset — Postgres numeric columns reject "" (22P02), so blank out to null.
function numOrNull(value) {
  return value === "" || value === undefined ? null : value;
}

export async function syncBeanToSupabase(bean) {
  console.log('syncBeanToSupabase called with id:', bean.id)
  try {
    // Strip photo fields before syncing (beans have none today, kept for parity)
    const cleanBean = stripPhotoFields(bean);
    const uid = await currentUserId();

    const { data, error } = await supabase
      .from('beans')
      .upsert({
        id: Number(cleanBean.id),
        user_id: uid,
        name: cleanBean.name,
        bagged_name: cleanBean.baggedName,
        origin: cleanBean.origin,
        region: cleanBean.region,
        producer: cleanBean.producer,
        variety: cleanBean.variety,
        process: cleanBean.process,
        masl: numOrNull(cleanBean.masl),
        sourced_from: cleanBean.sourcedFrom,
        tasting_targets: cleanBean.tastingTargets,
        purchase_date: cleanBean.purchaseDate,
        purchase_weight: numOrNull(cleanBean.purchaseWeight),
        weight_adjustments: cleanBean.weightAdjustments || [],
      });

    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("Failed to sync bean to Supabase", e);
    return false;
  }
}

export async function deleteBeanFromSupabase(id) {
  try {
    const { error } = await supabase
      .from('beans')
      .delete()
      .eq('id', Number(id));

    if (error) throw error;
  } catch (e) {
    console.warn("Failed to delete bean from Supabase", e);
  }
}

export async function fetchBeansFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('beans')
      .select('*');

    if (error) {
      console.warn("Supabase error fetching beans:", error);
      return [];
    }

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.map(b => ({
      id: b.id,
      name: b.name,
      baggedName: b.bagged_name,
      origin: b.origin,
      region: b.region,
      producer: b.producer,
      variety: b.variety,
      process: b.process,
      masl: b.masl,
      sourcedFrom: b.sourced_from,
      tastingTargets: b.tasting_targets,
      purchaseDate: b.purchase_date,
      purchaseWeight: b.purchase_weight,
      weightAdjustments: b.weight_adjustments || [],
    }));
  } catch (e) {
    console.warn("Failed to fetch beans from Supabase", e);
    return [];
  }
}
