use actix::{Actor, Addr, AsyncContext, Handler, StreamHandler};
use actix::prelude::*;
use actix_web_actors::ws;
use super::actor::{Connect, Disconnect, WsActor, WsMessage};
use uuid::Uuid;
use log::info;

pub struct WebsocketConnect {
    pub id: String,
    ws_actor: Addr<WsActor>,
}
impl WebsocketConnect {
    pub fn new(ws_actor: Addr<WsActor>) -> Self {
        Self {
            id: String::from(""),
            ws_actor,
        }
    }
}


impl Actor for WebsocketConnect {
    type Context = ws::WebsocketContext<Self>;
    fn started(&mut self, ctx: &mut Self::Context) {
        println!("started");
        // self.ws_actor.do_send(WsMessage(String::from("connect")));
        ctx.text("connect");
        let addr = ctx.address();
        self.ws_actor
        .send(Connect {
            id: format!("{}", Uuid::new_v4()),
            addr: addr.recipient(),
        })
        .into_actor(self)
        .then(|res, act, ctx| {
           match res {
            Ok(res) => {
                info!("{}", res);
                act.id = res;
            },
            _ => ctx.stop(),
           } 
           fut::ready(())
        })
        .wait(ctx);
    }

    fn stopping(&mut self, _: &mut Self::Context) -> Running {
        self.ws_actor.do_send(Disconnect { id: self.id.clone() });
        Running::Stop
    }
}
impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebsocketConnect {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        let msg = match msg {
            Err(_) => {
                ctx.stop();
                return;
            }
            Ok(msg) => msg,
        };
        println!("WEBS {msg:?}");
        match msg {
            ws::Message::Text(text) => ctx.text(text),
            ws::Message::Close(reason) => {
                ctx.close(reason);
                ctx.stop();
            }
            _ => (),
        }
    }
}
impl Handler<WsMessage> for WebsocketConnect {
    type Result = ();
    fn handle(&mut self, msg: WsMessage, ctx: &mut ws::WebsocketContext<Self>) -> Self::Result {
        ctx.text(msg.0);
    }
}