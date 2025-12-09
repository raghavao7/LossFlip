export const fmt = (n) => {
  if (n === undefined || n === null) return "₹0";
  return "₹" + Number(n).toLocaleString("en-IN");
};
