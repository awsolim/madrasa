import { AppLoadingSkeleton, type LoadingLayout } from "@/components/data/data-loading";
import { PageTitleBar } from "@/components/layout/page-title-bar";

// A route fallback has the destination's own chrome and content shape. It only
// appears on a cold route payload; page data can continue loading in place.
export function RouteLoading({ title, layout }: { title: string; layout: LoadingLayout }) {
  return (
    <>
      <PageTitleBar title={title} />
      <AppLoadingSkeleton layout={layout} label={`Loading ${title.toLowerCase()}`} />
    </>
  );
}
