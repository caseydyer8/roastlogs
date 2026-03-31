import { supabase } from './supabaseClient';

export async function syncRoastToSupabase(roast) {
  console.log('syncRoastToSupabase called with id:', roast.id)
  try {
    const { data, error } = await supabase
      .from('roasts')
      .upsert({
        id: Number(roast.id),
        date: roast.date,
        bean_name: roast.beanName,
        green_weight: roast.greenWeight,
        roasted_weight: roast.roastedWeight,
        target_level: roast.targetLevel,
        duration: roast.duration,
        total_seconds: roast.totalSeconds,
        dev_seconds: roast.devSeconds,
        starting_settings: roast.startingSettings,
        roast_log: roast.roastLog,
        profile: roast.profile,
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
