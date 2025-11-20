import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`📦 Received ${topic} webhook for ${shop}`);

  if (session && payload?.current) {
    const current = payload.current as string[];
    await db.session.update({
      where: { id: session.id },
      data: { scope: current.toString() },
    });
  }

  return new Response();
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
