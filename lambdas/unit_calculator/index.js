exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event));
  const current_reading = parseFloat(event.current_reading || 0);
  const previous_reading = parseFloat(event.previous_reading || 0);
  const units_consumed = Math.max(0, current_reading - previous_reading);
  return { units_consumed };
};
