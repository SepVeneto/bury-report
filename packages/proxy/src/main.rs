use once_cell::sync::Lazy;
use tokio::{
  io::copy_bidirectional,
  net::{TcpListener, TcpStream},
};

static STREAM_HOST: Lazy<String> = Lazy::new(|| {
  std::env::var("DOWNSTREAM").expect("without env DOWNSTREAM")
});

#[tokio::main]
async fn main() -> anyhow::Result<()> {
  env_logger::init();
  let listener = TcpListener::bind("0.0.0.0:7777").await?;
  log::info!("Listening on 0.0.0.0:7777");

  loop {
    let (socket, _) = listener.accept().await?;

    tokio::spawn(async move {
      let mut buf = vec![0u8; 4096];

      let n = match socket.peek(&mut buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
      };

      let raw_req = String::from_utf8_lossy(&buf[..n]);
      let invalid = raw_req
        .lines()
        .find(|l| {
          let str = l.to_ascii_lowercase();
          let version = str.ends_with("http/1.0");
          let length = str.starts_with("content-length");

          !length && version
        });

      if invalid.is_some() {
        log::info!("Raw Request:\n{}", raw_req);
      }

      if let Err(e) = handle(socket).await {
        log::error!("Error handling connection: {}", e);
      } else {
        log::info!("Connection send");
      }
    });
  }
}

async fn handle(mut inbound: TcpStream) -> anyhow::Result<()> {
  let mut outbound = TcpStream::connect(&*STREAM_HOST).await?;

  copy_bidirectional(&mut inbound, &mut outbound).await?;
  Ok(())
}
