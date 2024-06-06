use actix::{Actor, Addr, AsyncContext, Handler, StreamHandler};
use actix::prelude::*;
use actix_web_actors::ws;
use super::actor::{Connect, Disconnect, WsActor, WsMessage};
use uuid::Uuid;
use log::info;

pub struct WebsocketConnect {
    pub id: String,
    app_id: String,
    ws_actor: Addr<WsActor>,
}
impl WebsocketConnect {
    pub fn new(app_id: String, ws_actor: Addr<WsActor>) -> Self {
        Self {
            id: String::from(""),
            app_id,
            ws_actor,
        }
    }
}


impl Actor for WebsocketConnect {
    type Context = ws::WebsocketContext<Self>;
    fn started(&mut self, ctx: &mut Self::Context) {
        println!("started");
        ctx.text("CONNECT");
        // self.ws_actor.do_send(WsMessage(String::from("connect")));
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
        match msg {
            ws::Message::Text(text) => {
                if text.to_string() == "PING" {
                    ctx.text("PONG");
                }
            },
            ws::Message::Ping(_ping) => ctx.pong(b""),
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
        if self.app_id == msg.app_id {
            ctx.text(msg.text);
        }
    }
}