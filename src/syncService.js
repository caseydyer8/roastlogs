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

export async function syncRoastToSupabase(roast) {
  console.log('syncRoastToSupabase called with id:', roast.id)
  try {
    // Strip photo fields before syncing
    const cleanRoast = stripPhotoFields(roast);
    
    const { data, error } = await supabase
      .from('roasts')
      .upsert({
        id: Number(cleanRoast.id),
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
    
    const { data, error } = await supabase
      .from('tasting_notes')
      .upsert({
        id: Number(cleanBrew.id),
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
