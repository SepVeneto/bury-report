use std::collections::HashMap;
use actix::{Message, Recipient, Actor, Context, Handler};
use uuid::Uuid;

#[derive(Message)]
#[rtype(result = "()")]
pub struct LogMessage {
    pub text: String,
}
#[derive(Message)]
#[rtype(result = "()")]
pub struct Disconnect {
    pub id: String,
}
#[derive(Message)]
#[rtype(String)]
pub struct Connect {
    pub id: String,
    pub addr: Recipient<WsMessage>,
}
#[derive(Message)]
#[rtype(result = "()")]
pub struct WsMessage(pub String);
pub struct WsActor {
    sessions: HashMap<String, Recipient<WsMessage>>
}
impl WsActor {
    pub fn new() -> WsActor {
        WsActor {
            sessions: HashMap::new(),
        }
    }
}
// impl WsActor {
//     pub fn send_message(&self, message: &str) {
//         for (_, session_addr) in self.sessions.iter() {
//             session_addr.do_send(WsMessage(message.to_owned()));
//         }
//     }
// }
impl Actor for WsActor {
    type Context = Context<Self>;
}
impl Handler<Connect> for WsActor {
    type Result = String;
    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) -> Self::Result {
        println!("Someone joined.");

        let id = format!("{}", Uuid::new_v4());
        self.sessions.insert(id.clone(), msg.addr);

        id
    }
}
impl Handler<Disconnect> for WsActor {
    type Result = ();
    fn handle(&mut self, msg: Disconnect, _: &mut Context<Self>) {
        println!("Someone disconnected");

        let _ = self.sessions.remove(&msg.id).is_some();
    }
}
impl Handler<LogMessage> for WsActor {
    type Result = ();
    fn handle(&mut self, msg: LogMessage, _: &mut Context<Self>) -> Self::Result {
        println!("{}", self.sessions.len());
        for (_, session) in self.sessions.iter() {
            session.do_send(WsMessage(msg.text.clone()));
        }
    }
}
