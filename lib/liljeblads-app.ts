/** Public app URL for opening a work order. Server may override via LILJEBLADS_APP_URL. */
export function liljebladsWorkOrderHref(workOrderId: string): string {
  return `https://liljeblads.vercel.app/work-orders?id=${encodeURIComponent(workOrderId)}`;
}
