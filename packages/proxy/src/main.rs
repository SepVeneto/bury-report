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
      let http_1_0 = raw_req.lines().find(|l| {
        let line = l.to_ascii_lowercase();
        line.ends_with("http/1.0")
      });

      if http_1_0.is_some() {
        if let Some((header, _)) = parse_http_request_header(&buf[..n]) {
          log::info!("Raw Header:\n{}", String::from_utf8_lossy(header));
        } else {
          log::error!("Invalid HTTP request")
        }
      }

      if let Err(e) = handle(socket).await {
        log::error!("Error handling connection: {}", e);
      }
    });
  }
}

async fn handle(mut inbound: TcpStream) -> anyhow::Result<()> {
  let mut outbound = TcpStream::connect(&*STREAM_HOST).await?;

  copy_bidirectional(&mut inbound, &mut outbound).await?;
  Ok(())
}

fn parse_http_request_header(raw: &[u8]) -> Option<(&[u8], usize)> {
  // 查找 CRLF CRLF
  if let Some(pos) = memchr::memmem::find(raw, b"\r\n\r\n") {
    // header 结束位置 = pos + 4
    let header_end = pos + 4;
    Some((&raw[..header_end], header_end))
  } else {
    None // header 还没接收完
  }
}
