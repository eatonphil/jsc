function debug(c) {
    console.log('The element is: ' + c);
}

function main() {
    var a = [0, 0];
    a.sort();
    console.log(Object.keys(a), a.length);
    console.log(a);
    a.unshift(43);
    a.unshift(65);
    a.unshift(35);
    console.log(Object.getOwnPropertyNames(a));
    console.log(a);
    a.map(debug);
}
