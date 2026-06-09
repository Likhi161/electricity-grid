exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event));
  const units = parseFloat(event.units || 0);
  const rate = parseFloat(event.rate || 0);
  const amount = parseFloat((units * rate).toFixed(2));
  return { amount };
};
