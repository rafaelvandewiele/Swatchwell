/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://swatchwell.veyca.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const messages = {
  en: { subject:"Confirm your Swatchwell account deletion", body:"You requested deletion of your Swatchwell account. This link expires in 30 minutes. If you did not make this request, ignore this email.", button:"Confirm account deletion" },
  nl: { subject:"Bevestig de verwijdering van je Swatchwell-account", body:"Je hebt gevraagd om je Swatchwell-account te verwijderen. Deze link verloopt na 30 minuten. Heb je dit niet aangevraagd? Negeer deze e-mail dan.", button:"Accountverwijdering bevestigen" },
  fr: { subject:"Confirmez la suppression de votre compte Swatchwell", body:"Vous avez demandé la suppression de votre compte Swatchwell. Ce lien expire dans 30 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.", button:"Confirmer la suppression" },
  de: { subject:"Bestätige die Löschung deines Swatchwell-Kontos", body:"Du hast die Löschung deines Swatchwell-Kontos angefordert. Dieser Link läuft in 30 Minuten ab. Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.", button:"Kontolöschung bestätigen" },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type":"application/json" },
});
const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2,"0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers:cors });
  if (req.method !== "POST") return json({ error:"Method not allowed" },405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url,service);
  let body: {action?:string;token?:string};
  try { body=await req.json(); } catch { return json({error:"Invalid request"},400); }

  if(body.action==="request") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError || !user) return json({error:"Unauthorized"},401);
    const apiKey=Deno.env.get("RESEND_API_KEY");
    if(!apiKey) return json({error:"Email provider is not configured"},503);
    const {data:recent,error:recentError}=await admin.from("account_deletion_requests")
      .select("id")
      .eq("user_id",user.id)
      .gt("created_at",new Date(Date.now()-15*60*1000).toISOString())
      .limit(1);
    if(recentError) return json({error:"Could not verify the deletion request limit"},500);
    if(recent?.length) return json({error:"A confirmation email was already requested recently"},429);

    const {error:cleanupError}=await admin.from("account_deletion_requests")
      .delete()
      .eq("user_id",user.id);
    if(cleanupError) return json({error:"Could not prepare a new confirmation request"},500);
    const {data:profile}=await admin.from("profiles").select("language").eq("id",user.id).maybeSingle();
    const language = profile && profile.language in messages ? profile.language as keyof typeof messages : "en";
    const copy=messages[language];
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b)=>b.toString(16).padStart(2,"0")).join("");
    const tokenHash=await digest(token);
    const {error:insertError}=await admin.from("account_deletion_requests").insert({
      user_id:user.id,token_hash:tokenHash,expires_at:new Date(Date.now()+30*60*1000).toISOString()
    });
    if(insertError) return json({error:"Could not create confirmation"},500);
    const confirmUrl = "https://swatchwell.veyca.dev/account-deletion/confirm?token="+encodeURIComponent(token);
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        from:"Swatchwell <swatchwell@veyca.dev>",
        to:[user.email],
        subject:copy.subject,
        html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#243247"><h1>Swatchwell</h1><p>${copy.body}</p><p><a href="${confirmUrl}" style="display:inline-block;padding:13px 18px;background:#243247;color:white;text-decoration:none">${copy.button}</a></p><p style="font-size:12px;color:#777">30 minutes</p></div>`,
      }),
    });
    if(!response.ok) {
      await admin.from("account_deletion_requests").delete().eq("token_hash",tokenHash);
      return json({error:"Could not send confirmation email"},502);
    }
    return json({success:true});
  }

  if(body.action==="confirm") {
    if(typeof body.token!=="string" || body.token.length<32 || body.token.length>200) return json({error:"Invalid token"},400);
    const tokenHash=await digest(body.token);
    const {data:request,error:requestError}=await admin.from("account_deletion_requests")
      .select("id,user_id,expires_at").eq("token_hash",tokenHash).maybeSingle();
    if(requestError || !request || new Date(request.expires_at).getTime()<Date.now()) return json({error:"Invalid or expired token"},400);
    const targetUserId=request.user_id;

    // Resolve billing records before deleting the auth user. A database error
    // must not silently leave a live Stripe subscription behind.
    const [{data:subscription,error:subscriptionError},{data:billingCustomer,error:customerError}] = await Promise.all([
      admin.from("billing_subscriptions")
        .select("stripe_subscription_id,status")
        .eq("user_id",targetUserId)
        .maybeSingle(),
      admin.from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id",targetUserId)
        .maybeSingle(),
    ]);
    if(subscriptionError || customerError) {
      return json({error:"Could not verify billing records before account deletion"},500);
    }

    if(subscription || billingCustomer) {
      const stripeKey=Deno.env.get("STRIPE_SECRET_KEY");
      if(!stripeKey) return json({error:"Billing cleanup is not configured"},503);

      const stripeHeaders={Authorization:"Bearer "+stripeKey};
      let stripeCustomerId=billingCustomer?.stripe_customer_id;
      if(subscription?.stripe_subscription_id) {
        const subscriptionUrl="https://api.stripe.com/v1/subscriptions/"+encodeURIComponent(subscription.stripe_subscription_id);
        const currentResponse=await fetch(subscriptionUrl,{headers:stripeHeaders});
        if(currentResponse.status!==404) {
          const current=await currentResponse.json();
          if(!currentResponse.ok) return json({error:"Could not verify the Stripe subscription"},502);
          if(typeof current.customer==="string") stripeCustomerId=stripeCustomerId??current.customer;
          if(current.status!=="canceled" && current.status!=="incomplete_expired") {
            const cancelResponse=await fetch(subscriptionUrl,{method:"DELETE",headers:stripeHeaders});
            if(!cancelResponse.ok) return json({error:"Could not cancel the Stripe subscription"},502);
          }
        }
      }

      if(stripeCustomerId) {
        const customerResponse=await fetch(
          "https://api.stripe.com/v1/customers/"+encodeURIComponent(stripeCustomerId),
          {method:"DELETE",headers:stripeHeaders},
        );
        if(!customerResponse.ok && customerResponse.status!==404) {
          return json({error:"Could not remove the Stripe customer"},502);
        }
      }
    }

    // Remove every page of private wardrobe photos before deleting the auth
    // user. Storage objects do not cascade with auth.users, so a failed list
    // or removal must stop deletion rather than silently orphan personal data.
    while (true) {
      const {data:files,error:listError}=await admin.storage
        .from("wardrobe-photos")
        .list(targetUserId,{limit:1000,offset:0});
      if(listError) return json({error:"Could not enumerate wardrobe photos"},500);

      const paths=(files??[]).map((file)=>targetUserId+"/"+file.name);
      if(paths.length===0) break;

      const {error:removeError}=await admin.storage
        .from("wardrobe-photos")
        .remove(paths);
      if(removeError) return json({error:"Could not remove wardrobe photos"},500);

      // Always read from offset zero because deleting a page shifts the
      // remaining objects forward.
      if(paths.length<1000) break;
    }

    const {error:deleteError}=await admin.auth.admin.deleteUser(targetUserId);
    if(deleteError) return json({error:"Could not delete account"},500);
    return json({success:true});
  }
  return json({error:"Unsupported action"},400);
});
