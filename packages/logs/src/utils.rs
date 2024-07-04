use std::{collections::HashMap, ops::Deref};
use std::rc::Rc;
use std::cell::RefCell;

use bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

pub trait LikeNode {
    fn id(&self) -> ObjectId;
    fn pid(&self) -> Option<ObjectId>;
}
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Node<T: LikeNode> {
    #[serde(flatten)]
    base: T,
    children: RefCell<Vec<T>>,
}
pub type TreeList<T> = Vec<Node<T>>;

pub fn array_to_tree<T: LikeNode + Clone>(list: Vec<T>) -> TreeList<T> {
    let mut map: HashMap<ObjectId, Rc<Node<T>>> = HashMap::new();
    let mut root = vec![];

    for node in list.clone() {
        let tree_node: Rc<Node<T>> = Rc::new(Node {
            base: node.clone(),
            children: RefCell::new(vec![])
        });
        map.insert(node.id(), tree_node);
    }

    for node in list {
        if let Some(pid) = node.pid() {
            if let Some(parent) = map.get(&pid) {
                parent.children.borrow_mut().push(node);
            }
        } else {
            if let Some(node) = map.get(&node.id()) {
                root.push(node.clone());
            }
        }
    }

    let res = root.iter().map(|item| {
        return item.as_ref().clone();
    }).collect::<Vec<Node<T>>>();
    res
}
