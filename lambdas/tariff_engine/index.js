exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event));
  const tariff_name = event.tariff_name || 'Standard';
  let rate_per_unit = 0.15;
  if (tariff_name.toLowerCase().includes('commercial')) {
    rate_per_unit = 0.20;
  } else if (tariff_name.toLowerCase().includes('industrial')) {
    rate_per_unit = 0.25;
  }
  return { rate_per_unit };
};
